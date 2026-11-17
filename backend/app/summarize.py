import re
from typing import Optional

from .clients import llm_client, transcription_client

# 企业会议摘要模板
ENTERPRISE_MEETING_PROMPT = """请将以下会议转写内容整理为完整、专业的结构化会议纪要，使用 Markdown 格式输出。

重要要求：
1. 必须覆盖全部有实质信息的发言，不要只总结前半段。
2. 会议主题要从工作内容、议题和结论中归纳，禁止把“大家好”“下午好”“我们开会”等开场问候当作主题。
3. 问候语、寒暄、自我介绍只作为背景，不要放进会议主题或概要核心句。
4. 如果后文出现新进展、风险、整改、跨部门协同等信息，即使篇幅较短也必须写入纪要。
5. 没有明确决策、负责人或截止日期时，写“暂无明确决策”“待明确”，不要编造。

## 会议概要
（2-3 句话概述会议真实主题、主要进展和待解决事项）

## 主要讨论点
（按话题分条列出，覆盖全部实质发言；每条包含讨论内容和结论/状态）

## 关键决策
（明确达成的决策事项，逐条列出）

## 行动项
| 任务 | 负责人 | 截止日期 |
|------|--------|----------|
（从对话中提取具体的任务分配，若无则填"暂无"）

## 待跟进问题
（未解决或需要后续讨论的问题）

请用中文回复，必须结合现有内容输出完整纪要。若信息不足，请写成自然说明，例如“本次会议未形成明确决策”或“对话中未明确负责人”，不要只输出“未提及”。

转写内容：
{transcript}
"""

# 实时会议增量摘要模板（用于每分钟周期性总结）
REALTIME_INCREMENTAL_PROMPT = """请将以下实时会议转写片段整理为简洁要点，用 Markdown 列表输出。

要求：
1. 用 3-6 个要点概括这段对话的核心内容。
2. 突出讨论的关键话题、结论和待办事项。
3. 保留专有名词和数字的准确性。
4. 若信息不足以形成要点，请简要说明正在讨论的话题方向。
5. 只输出要点列表，不要大标题。

转写片段：
{transcript}
"""

def _call_llm_prompt(prompt: str, provider: str, model: str, api_key: str):
    """内部辅助：根据 provider 返回对应的协程"""
    return llm_client.create_prompt_completion(prompt, provider, model, api_key)


def _inject_notes(transcript: str, notes: Optional[list[dict]] = None, transcript_label: str = "会议转写内容") -> str:
    if not notes:
        return transcript
    lines = []
    for note in notes:
        content = note.get("content", "").strip()
        if not content:
            continue
        ts = note.get("timestamp", "")
        ts_display = ts
        if ts:
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                ts_display = dt.strftime("%H:%M:%S")
            except Exception:
                pass
        lines.append(f"[{ts_display}] {content}")
    if not lines:
        return transcript
    notes_text = "\n".join(lines)
    return (
        "用户在会议过程中添加了以下备注，请在整理纪要时参考这些备注（例如人名、要点、待办等）：\n\n"
        f"【用户备注】\n{notes_text}\n\n"
        f"【{transcript_label}】\n{transcript}"
    )


def _build_prompt(transcript: str, template: Optional[str]) -> str:
    prompt = template if template else ENTERPRISE_MEETING_PROMPT
    return prompt.format(transcript=transcript)









async def _call_llm_text(prompt: str, provider: str, model: str, api_key: str) -> str:
    return await llm_client.generate_text(prompt, provider, model, api_key)


async def summarize_with_qwen(text: str, model: str, api_key: str, template: Optional[str] = None) -> str:
    return await _call_llm_text(_build_prompt(text, template), "qwen", model, api_key)


async def summarize_with_claude(text: str, model: str, api_key: str, template: Optional[str] = None) -> str:
    return await _call_llm_text(_build_prompt(text, template), "claude", model, api_key)


async def summarize_with_openai(text: str, model: str, api_key: str, template: Optional[str] = None) -> str:
    return await _call_llm_text(_build_prompt(text, template), "openai", model, api_key)


def _split_hot_words(hot_words: Optional[str]) -> list[str]:
    if not hot_words:
        return []
    return [item.strip() for item in hot_words.split("|") if item.strip()]


def normalize_transcript_text(text: str, hot_words: Optional[str]) -> str:
    normalized = text
    terms = sorted(_split_hot_words(hot_words), key=len, reverse=True)
    for term in terms:
        if len(term) < 2:
            continue
        pattern = r"[\s\-_/·,，。;；:：、]*".join(re.escape(ch) for ch in term)
        normalized = re.sub(pattern, term, normalized, flags=re.I)
    return normalized


TRANSLATION_PROMPT = """请将以下会议转写内容翻译成自然、准确的中文。

要求：
1. 只输出译文正文，不要 Markdown，不要解释。
2. 保留专有名词、数字、代码、接口名和产品名的准确性。
3. 尽量逐句对应原文，保持口语语气。

原文：
{transcript}
"""

CHAPTER_EXTRACT_PROMPT = """请根据以下会议转写提取 3-8 个章节，按内容主题切分。

要求：
1. 只输出 JSON 数组，不要 Markdown，不要代码块，不要额外说明。
2. 每个章节对象包含：
   - title：章节标题，简短自然，最多 12 个汉字
   - start_sequence_id：章节开始对应的转写段序号，必须是整数
   - summary：这一章的一句话速览
3. 章节必须按 start_sequence_id 从小到大排序。
4. 第一章的 start_sequence_id 必须是 0。
5. 章节之间不要重叠，尽量覆盖全部内容。
6. 如果内容不足以切分成多个章节，也只返回 1 个章节。

转写内容：
{transcript}
"""

# 决策型会议模板
DECISION_MEETING_PROMPT = """请将以下会议转写内容总结为决策型会议纪要，重点突出决策过程和结果。

## 核心决策
（本次会议做出的关键决策，逐项说明决策内容和决策依据）

## 决策背景
（促成决策的主要讨论和考量因素）

## 否决/搁置方案
（被否决或暂缓的方案及原因）

## 后续执行
| 决策事项 | 执行人 | 执行期限 | 验收标准 |
|----------|--------|----------|----------|
（列出每项决策的执行安排）

## 待明确问题
（仍需进一步确认或决策的问题）

请用中文回复，必须结合现有内容输出完整纪要。若信息不足，请写成自然说明，例如“本次会议未形成明确决策”或“对话中未明确负责人”，不要只输出“未提及”。

转写内容：
{transcript}
"""

# 创意脑暴会议模板
BRAINSTORM_MEETING_PROMPT = """请将以下会议转写内容整理为创意脑暴会议记录，保留所有创意火花。

## 会议主题
（本次头脑风暴聚焦的核心问题或机会）

## 创意汇总
### 主流方向
（获得较多讨论的创意方向）

### 创新想法
（新颖、有潜力的创意点）

### 待深化方向
（提及但需要进一步探索的方向）

## 创意评估
（会议中对创意的初步评价和筛选讨论）

## 下一步探索
（决定深入研究的方向和分工）

## 灵感碎片
（零散的想法和关键词，供后续参考）

请用中文回复，尽量保留原始表述的创意感。

转写内容：
{transcript}
"""

# 访谈记录模板
INTERVIEW_MEETING_PROMPT = """请将以下访谈/对话转写整理为结构化访谈记录。

## 受访者信息
（从对话中提取的受访者背景信息）

## 核心观点
（受访者表达的主要立场和观点）

## 关键洞察
（值得重点记录的见解和判断）

## 重要引述
（原话记录，用引号标注最有价值的表述）

## 问题与回应
（重要问题及受访者的核心回答，Q&A 格式）

## 后续跟进
（受访者提到的可跟进方向或对话者的行动项）

请用中文回复，重点保留受访者的原始观点。

转写内容：
{transcript}
"""


async def generate_summary(transcript: str, provider: str, model: str, api_key: str, template: Optional[str] = None) -> str:
    from .services import summary_service

    return await summary_service.generate_summary(transcript, provider, model, api_key, template)


async def translate_transcript_text(transcript: str, provider: str, model: str, api_key: str) -> str:
    from .services import summary_service

    return await summary_service.translate_transcript_text(transcript, provider, model, api_key)


async def generate_chapters(segments: list[dict], provider: str, model: str, api_key: str) -> list[dict]:
    from .services import summary_service

    return await summary_service.generate_chapters(segments, provider, model, api_key)


async def transcribe_audio_file(file_bytes: bytes, filename: str, api_key: str) -> str:
    return await transcription_client.transcribe_audio_file(file_bytes, filename, api_key)
