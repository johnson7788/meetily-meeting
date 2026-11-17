"""LangGraph ReAct Agent for meeting chat with read/grep tools."""

import logging
import re
from typing import Literal

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

logger = logging.getLogger(__name__)

MAX_TRANSCRIPT_CHARS = 15000
MAX_GREP_RESULTS = 10
MAX_CITATIONS = 5

AGENT_SYSTEM_PROMPT = """你是一个专业的会议助手，可以帮助用户查询和分析会议记录。

你可以使用以下工具来获取信息：
- read_meeting: 读取会议的转写记录、摘要、待办事项或元信息
- grep_meeting: 按关键词搜索会议转写内容，支持按发言人过滤

回答要求：
1. 只基于工具返回的数据回答，不要编造信息。
2. 如果工具未返回相关信息，诚实地说"根据会议记录，没有找到相关信息"。
3. 回答要简洁、有条理，使用中文。
4. 涉及具体内容时尽量引用原文。
5. 可以适当总结归纳，但要标明是归纳而非原文。
6. 当用户问及数量、统计类问题时，使用 read_meeting 获取数据后精确计算。"""


# ---------------------------------------------------------------------------
# Tool factories (meeting data injected via closure)
# ---------------------------------------------------------------------------

def make_read_meeting_tool(meeting_data: dict):
    from langchain_core.tools import tool as lc_tool

    @lc_tool
    def read_meeting(
        section: Literal["transcripts", "summary", "action_items", "meta", "all"] = "all",
    ) -> str:
        """Read meeting data. Use 'transcripts' for full transcript, 'summary' for the meeting summary,
        'action_items' for tasks, 'meta' for title/speaker info, or 'all' for everything."""
        parts: list[str] = []
        transcripts = meeting_data.get("transcripts", [])

        if section in ("meta", "all"):
            speakers = sorted({(seg.get("source") or "未知") for seg in transcripts})
            parts.append(
                f"会议标题: {meeting_data.get('title', '无')}\n"
                f"创建时间: {meeting_data.get('created_at', '未知')}\n"
                f"转写段数: {len(transcripts)}\n"
                f"发言人: {', '.join(speakers)}"
            )

        if section in ("transcripts", "all"):
            lines: list[str] = []
            for i, seg in enumerate(transcripts, 1):
                text = (seg.get("postprocessed_text") or seg.get("text") or "").strip()
                if not text:
                    continue
                speaker = seg.get("source", "未知说话人")
                timestamp = seg.get("timestamp", "")
                lines.append(f"[{i}][{timestamp}][{speaker}] {text}")
            content = "\n".join(lines)
            if len(content) > MAX_TRANSCRIPT_CHARS:
                content = content[:MAX_TRANSCRIPT_CHARS] + "\n...(内容已截断)"
            parts.append(f"转写记录:\n{content}")

        if section in ("summary", "all"):
            summary = meeting_data.get("summary")
            if summary and summary.get("status") == "completed" and summary.get("content"):
                parts.append(f"会议摘要:\n{summary['content']}")
            else:
                parts.append("会议摘要: 暂无")

        if section in ("action_items", "all"):
            items = meeting_data.get("action_items", [])
            if items:
                item_lines = [
                    f"- {it['task']} (负责人: {it.get('owner', '未指定')}, "
                    f"截止: {it.get('due', '未指定')}, "
                    f"{'已完成' if it.get('done') else '未完成'})"
                    for it in items
                ]
                parts.append("待办事项:\n" + "\n".join(item_lines))
            else:
                parts.append("待办事项: 暂无")

        return "\n\n".join(parts) if parts else "无数据"

    return read_meeting


def make_grep_meeting_tool(meeting_data: dict):
    from langchain_core.tools import tool as lc_tool

    @lc_tool
    def grep_meeting(keyword: str, speaker: str | None = None) -> str:
        """Search meeting transcript by keyword. Optionally filter by speaker name.
        Returns matching transcript segments with their IDs, timestamps, and speakers.
        Use this when you need to find specific mentions or quotes."""
        transcripts = meeting_data.get("transcripts", [])
        keyword_lower = keyword.lower()
        results: list[dict] = []
        for seg in transcripts:
            text = (seg.get("postprocessed_text") or seg.get("text") or "").strip()
            if not text:
                continue
            if keyword_lower not in text.lower():
                continue
            if speaker and speaker.lower() not in (seg.get("source") or "").lower():
                continue
            results.append({
                "segment_id": seg["id"],
                "timestamp": seg.get("timestamp", ""),
                "speaker": seg.get("source", "未知说话人"),
                "text": text,
            })
            if len(results) >= MAX_GREP_RESULTS:
                break

        if not results:
            return f"未找到包含「{keyword}」的转写片段。"
        lines = [
            f"[segment_id={r['segment_id']}] [{r['timestamp']}] [{r['speaker']}] {r['text']}"
            for r in results
        ]
        return f"找到 {len(results)} 条匹配:\n" + "\n".join(lines)

    return grep_meeting


# ---------------------------------------------------------------------------
# LLM builder (multi-provider)
# ---------------------------------------------------------------------------

def _build_chat_model(provider: str, model: str, api_key: str):
    if provider == "qwen":
        return ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
    if provider == "openai":
        return ChatOpenAI(model=model, api_key=api_key)
    if provider == "claude":
        return ChatAnthropic(model=model, api_key=api_key, max_tokens=2048)
    raise ValueError(f"不支持的 provider: {provider}")


# ---------------------------------------------------------------------------
# Citation extraction
# ---------------------------------------------------------------------------

def _extract_citations(messages: list, meeting_data: dict) -> list[dict]:
    """Extract citations from grep_meeting tool call results in the agent trace."""
    segment_ids: set[str] = set()

    for i, msg in enumerate(messages):
        if not hasattr(msg, "tool_calls") or not msg.tool_calls:
            continue
        for tc in msg.tool_calls:
            if tc["name"] != "grep_meeting":
                continue
            tool_call_id = tc["id"]
            # Find the corresponding ToolMessage
            for j in range(i + 1, len(messages)):
                result_msg = messages[j]
                if getattr(result_msg, "tool_call_id", None) == tool_call_id:
                    _parse_segment_ids_from_text(result_msg.content, segment_ids)
                    break

    transcript_by_id = {seg["id"]: seg for seg in meeting_data.get("transcripts", [])}
    citations: list[dict] = []
    for seg_id in segment_ids:
        seg = transcript_by_id.get(seg_id)
        if seg:
            citations.append({
                "segment_id": seg["id"],
                "text": (seg.get("postprocessed_text") or seg.get("text") or ""),
                "speaker_label": seg.get("source"),
                "timestamp": seg.get("timestamp"),
            })
        if len(citations) >= MAX_CITATIONS:
            break
    return citations


def _parse_segment_ids_from_text(text: str, out_set: set):
    """Parse segment_id=xxx patterns from grep_meeting tool output."""
    for match in re.finditer(r"segment_id=([a-f0-9]+)", text):
        out_set.add(match.group(1))


# ---------------------------------------------------------------------------
# Agent entry point
# ---------------------------------------------------------------------------

async def run_meeting_agent(
    meeting_data: dict,
    question: str,
    history: list[dict],
    provider: str,
    model: str,
    api_key: str,
) -> dict:
    """Run the ReAct agent and return {answer, citations}."""
    tools = [
        make_read_meeting_tool(meeting_data),
        make_grep_meeting_tool(meeting_data),
    ]
    llm = _build_chat_model(provider, model, api_key)
    agent = create_react_agent(llm, tools, prompt=AGENT_SYSTEM_PROMPT)

    # Build LangChain message list from history + current question
    messages: list = []
    for msg in history:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            messages.append(AIMessage(content=msg["content"]))
    messages.append(HumanMessage(content=question))

    result = await agent.ainvoke({"messages": messages})

    # Extract final answer (last AI message with content)
    answer = ""
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and msg.content:
            answer = msg.content
            break

    # Extract citations from grep_meeting tool calls
    citations = _extract_citations(result["messages"], meeting_data)

    return {"answer": answer, "citations": citations}
