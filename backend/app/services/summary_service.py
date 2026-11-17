import json
import re
from typing import Optional

from ..summarize import (
    CHAPTER_EXTRACT_PROMPT,
    TRANSLATION_PROMPT,
    _call_llm_text,
    summarize_with_claude,
    summarize_with_openai,
    summarize_with_qwen,
)

_OPENING_PATTERNS = (
    r"大家[上下]午好",
    r"大家好",
    r"各位好",
    r"今天(召集)?大家(来)?开会",
    r"先简单(汇总|介绍)一下",
)


def _clean_transcript_line(text: str) -> str:
    line = text.strip()
    line = re.sub(r"^(?:\[[^\]]+\]\s*)+", "", line).strip()
    line = re.sub(r"^(说话人\s*\d+|Speaker\s*\d+|医生|患者|家属|主持人|嘉宾)[:：]\s*", "", line, flags=re.I)
    line = re.sub(r"\s+", " ", line)
    return line.strip(" -|•\t")


def _remove_opening_phrases(text: str) -> str:
    normalized = text.strip()
    for pattern in _OPENING_PATTERNS:
        normalized = re.sub(pattern, "", normalized)
    normalized = re.sub(r"^[，,。；;\s]+", "", normalized)
    return normalized.strip()


def _is_substantive_point(text: str) -> bool:
    cleaned = _remove_opening_phrases(text)
    if len(cleaned) < 6:
        return False
    return bool(re.search(r"进度|安排|计划|完成|问题|风险|效率|协同|整改|优化|落地|对接|负责人|截止|决策|项目|工作|推进", cleaned)) or len(cleaned) >= 14


def _pick_transcript_points(transcript: str, limit: int = 8) -> list[str]:
    points: list[str] = []
    for raw_line in transcript.splitlines():
        line = _clean_transcript_line(raw_line)
        if not line:
            continue
        for chunk in re.split(r"(?<=[。！？!?；;])", line):
            normalized = _remove_opening_phrases(chunk)
            if not _is_substantive_point(normalized):
                continue
            if normalized in points:
                continue
            points.append(normalized)
            if len(points) >= limit:
                return points
    return points


def _derive_meeting_topic(points: list[str]) -> str:
    joined = "；".join(points)
    topics: list[str] = []
    if re.search(r"复盘|进度|计划|安排|完成|整改|落地", joined):
        topics.append("项目进度复盘")
    if re.search(r"对接|卡顿|效率|跨部门|协同|推进", joined):
        topics.append("跨部门协同推进")
    if re.search(r"风险|问题|待跟进|优化", joined):
        topics.append("问题整改与优化")
    if topics:
        return "与".join(topics[:2])
    if points:
        first = re.split(r"[，,。；;]", points[0])[0].strip()
        return first[:24] or "会议信息同步"
    return "会议信息同步"


def _needs_summary_fallback(content: str) -> bool:
    stripped = content.strip()
    if not stripped:
        return True
    marker_count = stripped.count("未提及") + stripped.count("暂无")
    if marker_count >= 3:
        return True
    normalized = re.sub(r"[#\-_|\s`>*]", "", stripped)
    return len(normalized) < 36


def build_summary_fallback(transcript: str) -> str:
    points = _pick_transcript_points(transcript)
    if not points:
        return (
            "## 会议概要\n"
            "本次转写内容较少，暂未识别到足够形成会议主题、结论或任务安排的实质信息。\n\n"
            "## 主要讨论点\n"
            "- 原始转写内容较少，建议补充完整会议录音或转写后重新生成纪要。\n\n"
            "## 关键决策\n"
            "本次转写中未识别到明确决策。\n\n"
            "## 行动项\n"
            "| 任务 | 负责人 | 截止日期 |\n"
            "|------|--------|----------|\n"
            "| 待补充完整会议内容后确认 | 待明确 | 待明确 |\n\n"
            "## 待跟进问题\n"
            "- 建议补充完整会议内容后重新生成纪要。"
        )

    topic = _derive_meeting_topic(points)
    overview_parts = points[:3]
    overview = f"本次会议主要围绕{topic}展开。"
    overview += " 会议记录显示：" + "；".join(overview_parts) + "。"
    if len(points) > 3:
        overview += " 后续仍需结合全部原文补充负责人、时间节点和验收标准。"

    discussion = "\n".join(f"- {item}" for item in points)
    decisions = "本次会议以讨论和信息同步为主，当前转写中未识别到足够明确的最终决策，可结合原文继续补充。"
    actions = "| 任务 | 负责人 | 截止日期 |\n|------|--------|----------|\n| 根据会议内容补充明确负责人和时间节点 | 待明确 | 待明确 |"
    follow_up = "- 建议结合原始转写补充关键结论、负责人和时间节点。"
    for item in points:
        if re.search(r"问题|风险|卡顿|效率|协同|整改|优化|待跟进", item):
            follow_up += f"\n- 优先跟进：{item}"

    return (
        "## 会议概要\n"
        f"{overview}\n\n"
        "## 主要讨论点\n"
        f"{discussion}\n\n"
        "## 关键决策\n"
        f"{decisions}\n\n"
        "## 行动项\n"
        f"{actions}\n\n"
        "## 待跟进问题\n"
        f"{follow_up}"
    )


def _finalize_summary_output(transcript: str, content: str) -> str:
    if _needs_summary_fallback(content):
        return build_summary_fallback(transcript)
    return content.strip()


async def generate_summary(transcript: str, provider: str, model: str, api_key: str, template: Optional[str] = None, notes: Optional[list[dict]] = None) -> str:
    from ..summarize import _inject_notes
    enriched = _inject_notes(transcript, notes)
    if provider == "qwen":
        content = await summarize_with_qwen(enriched, model, api_key, template)
    elif provider == "claude":
        content = await summarize_with_claude(enriched, model, api_key, template)
    elif provider == "openai":
        content = await summarize_with_openai(enriched, model, api_key, template)
    else:
        raise ValueError(f"不支持的 provider: {provider}")
    return _finalize_summary_output(transcript, content)


async def translate_transcript_text(transcript: str, provider: str, model: str, api_key: str) -> str:
    prompt = TRANSLATION_PROMPT.format(transcript=transcript)
    return await _call_llm_text(prompt, provider, model, api_key)


def _build_chapter_transcript(segments: list[dict]) -> str:
    lines: list[str] = []
    for seg in segments:
        sequence_id = seg.get("sequence_id")
        if sequence_id is None:
            sequence_id = len(lines)
        lines.append(f"[{sequence_id}] {seg.get('text', '').strip()}")
    return "\n".join(lines)


def _extract_json_payload(text: str):
    payload = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", payload, re.S | re.I)
    if fence:
        payload = fence.group(1).strip()
    first_array = payload.find("[")
    first_object = payload.find("{")
    if first_array == -1 and first_object == -1:
        raise ValueError("章节接口返回内容不是 JSON")
    if first_array == -1 or (first_object != -1 and first_object < first_array):
        payload = payload[first_object:]
    else:
        payload = payload[first_array:]
    return json.loads(payload)


async def generate_chapters(segments: list[dict], provider: str, model: str, api_key: str) -> list[dict]:
    prompt = CHAPTER_EXTRACT_PROMPT.format(transcript=_build_chapter_transcript(segments))
    text = await _call_llm_text(prompt, provider, model, api_key)
    parsed = _extract_json_payload(text)
    items = parsed.get("chapters") if isinstance(parsed, dict) else parsed
    if not isinstance(items, list):
        raise ValueError("章节接口返回格式不正确")

    chapters: list[dict] = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        start_sequence_id = raw.get("start_sequence_id")
        if not isinstance(start_sequence_id, int):
            try:
                start_sequence_id = int(start_sequence_id)
            except (TypeError, ValueError):
                continue
        title = str(raw.get("title", "")).strip() or f"章节 {len(chapters) + 1}"
        summary = str(raw.get("summary", "")).strip()
        chapters.append({
            "title": title,
            "start_sequence_id": start_sequence_id,
            "summary": summary,
        })

    chapters.sort(key=lambda item: item["start_sequence_id"])
    if not chapters:
        raise ValueError("未提取到章节")
    return chapters


async def generate_incremental_summary(transcript: str, provider: str, model: str, api_key: str, notes: Optional[list[dict]] = None) -> str:
    from ..summarize import REALTIME_INCREMENTAL_PROMPT, _inject_notes, summarize_with_qwen, summarize_with_claude, summarize_with_openai

    enriched = _inject_notes(transcript, notes, transcript_label="会议转写片段")
    if provider == "qwen":
        content = await summarize_with_qwen(enriched, model, api_key, REALTIME_INCREMENTAL_PROMPT)
    elif provider == "claude":
        content = await summarize_with_claude(enriched, model, api_key, REALTIME_INCREMENTAL_PROMPT)
    elif provider == "openai":
        content = await summarize_with_openai(enriched, model, api_key, REALTIME_INCREMENTAL_PROMPT)
    else:
        raise ValueError(f"不支持的 provider: {provider}")
    return (content or "").strip() or "暂无足够内容生成摘要。"
