import json
import logging
import os
import uuid
from typing import Optional

from fastapi import BackgroundTasks, HTTPException, UploadFile

from ..api.deps.auth import CurrentUser
from ..repositories.action_items import get_action_items, replace_action_items
from ..repositories.meetings import (
    create_meeting,
    create_summary_pending,
    delete_meeting,
    get_all_meetings,
    get_chapters,
    get_meeting,
    save_chapters,
    save_transcripts,
    update_meeting_title,
    update_summary,
)
from ..repositories.notes import save_notes
from ..repositories.speaker_labels import replace_speaker_labels, upsert_default_speaker_labels
from ..repositories.templates import get_template
from ..diarization import normalize_diarized_sentences
from ..models import ActionItemsPayload, MeetingChatRequest, SaveMeetingRequest, SpeakerLabelPayload, SummarizeRequest, UpdateTitleRequest
from ..summarize import BRAINSTORM_MEETING_PROMPT, DECISION_MEETING_PROMPT, INTERVIEW_MEETING_PROMPT, normalize_transcript_text
from . import meeting_agent, summary_service, transcription_service
from ..config import get_llm_api_key, get_llm_model, get_llm_provider
from .tingwu_transcription_service import transcribe_file_with_tingwu

logger = logging.getLogger("meetily")


def _format_summary_timestamp(value: object) -> str:
    raw = str(value or "").strip()
    try:
        total_seconds = int(float(raw))
    except ValueError:
        return raw
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes:02d}:{seconds:02d}"


def _build_summary_transcript(segments: list[dict]) -> str:
    lines: list[str] = []
    for index, segment in enumerate(segments, start=1):
        text = str(segment.get("postprocessed_text") or segment.get("text") or "").strip()
        if not text:
            continue
        speaker = str(segment.get("source") or "未知说话人").strip()
        timestamp = _format_summary_timestamp(segment.get("timestamp"))
        prefix = f"[{index}]"
        if timestamp:
            prefix += f"[{timestamp}]"
        prefix += f"[{speaker}]"
        lines.append(f"{prefix} {text}")
    return "\n".join(lines)


def _require_tingwu_public_base_url() -> str:
    public_base_url = os.getenv("MEETILY_PUBLIC_BASE_URL", "").strip()
    if not public_base_url:
        raise HTTPException(status_code=500, detail="缺少听悟公开访问地址配置")
    return public_base_url.rstrip("/")


async def seed_default_templates(get_all_templates, create_template) -> None:
    templates = await get_all_templates()
    existing_names = {template["name"] for template in templates}
    defaults = [
        ("决策型会议", DECISION_MEETING_PROMPT),
        ("创意脑暴", BRAINSTORM_MEETING_PROMPT),
        ("访谈记录", INTERVIEW_MEETING_PROMPT),
    ]
    for name, content in defaults:
        if name not in existing_names:
            await create_template(uuid.uuid4().hex, name, content)
            logger.info("预置模板: %s", name)


async def require_user_meeting(meeting_id: str, current_user: CurrentUser) -> dict:
    meeting = await get_meeting(meeting_id, current_user.user_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


async def list_meetings(current_user: CurrentUser) -> list[dict]:
    meetings = await get_all_meetings(current_user.user_id)
    logger.info("GET /api/meetings → %d 条", len(meetings))
    return meetings


async def get_meeting_detail(meeting_id: str, current_user: CurrentUser) -> dict:
    return await require_user_meeting(meeting_id, current_user)


async def save_meeting(req: SaveMeetingRequest, current_user: CurrentUser) -> dict:
    await create_meeting(req.meeting_id, req.title, current_user.user_id, current_user.username, req.project_name)
    segments = []
    for seg in req.segments:
        payload = seg.model_dump()
        if not payload.get("postprocessed_text") and req.hot_words:
            normalized = normalize_transcript_text(payload.get("text", ""), req.hot_words)
            if normalized != payload.get("text", ""):
                payload["postprocessed_text"] = normalized
        segments.append(payload)
    await save_transcripts(req.meeting_id, segments)
    await save_notes(req.meeting_id, [n.model_dump() for n in req.notes])
    await upsert_default_speaker_labels(req.meeting_id, segments)
    logger.info("POST /api/meetings → 保存 %s（%d 段）", req.meeting_id, len(req.segments))
    return {"meeting_id": req.meeting_id}


async def upload_meeting(
    file: UploadFile,
    title: Optional[str],
    project_name: Optional[str],
    current_user: CurrentUser,
) -> dict:
    allowed = {".mp3", ".wav", ".m4a", ".mp4", ".ogg", ".flac", ".webm", ".aac"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"不支持的文件格式 {ext}，支持：mp3/wav/m4a/mp4/ogg/flac/webm")
    file_bytes = await file.read()
    logger.info("上传音频 filename=%s size=%d bytes", file.filename, len(file_bytes))
    try:
        segments = await transcribe_file_with_tingwu(
            file_bytes,
            file.filename or "audio",
            public_base_url=_require_tingwu_public_base_url(),
        )
    except Exception as exc:
        logger.error("转写失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"转写失败: {str(exc)}")
    segments = normalize_diarized_sentences(segments)
    meeting_id = uuid.uuid4().hex
    base_name = os.path.splitext(file.filename or "音频")[0]
    meeting_title = title or f"上传 · {base_name}"
    await create_meeting(meeting_id, meeting_title, current_user.user_id, current_user.username, project_name)
    await save_transcripts(meeting_id, segments)
    await upsert_default_speaker_labels(meeting_id, segments)
    logger.info("上传转写完成 meeting_id=%s segments=%d", meeting_id, len(segments))
    return {"meeting_id": meeting_id, "title": meeting_title}


async def save_recorded_meeting(
    file: UploadFile,
    meeting_id: str,
    title: str,
    raw_segments: str,
    project_name: Optional[str],
    current_user: CurrentUser,
) -> dict:
    file_bytes = await file.read()
    try:
        json.loads(raw_segments)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"raw_segments 格式错误: {str(exc)}")

    segments = await transcribe_file_with_tingwu(
        file_bytes,
        file.filename or "recording.wav",
        public_base_url=_require_tingwu_public_base_url(),
    )

    segments = normalize_diarized_sentences(segments)
    await create_meeting(meeting_id, title, current_user.user_id, current_user.username, project_name)
    await save_transcripts(meeting_id, segments)
    await upsert_default_speaker_labels(meeting_id, segments)
    logger.info("录音保存完成 meeting_id=%s segments=%d", meeting_id, len(segments))
    return {"meeting_id": meeting_id}


async def rename_meeting(meeting_id: str, req: UpdateTitleRequest, current_user: CurrentUser) -> dict:
    await require_user_meeting(meeting_id, current_user)
    await update_meeting_title(meeting_id, req.title)
    logger.info("PUT /api/meetings/%s/title → %s", meeting_id, req.title)
    return {"ok": True}


async def rename_speaker_label(meeting_id: str, source: str, req: SpeakerLabelPayload, current_user: CurrentUser) -> list[dict]:
    meeting = await require_user_meeting(meeting_id, current_user)
    labels = meeting.get("speaker_labels", [])
    next_labels = []
    found = False
    for label in labels:
        if label.get("source") == source:
            next_labels.append({"source": source, "label": req.label})
            found = True
        else:
            next_labels.append({"source": label.get("source"), "label": label.get("label", "")})
    if not found:
        next_labels.append({"source": source, "label": req.label})
    saved = await replace_speaker_labels(meeting_id, next_labels)
    logger.info("PUT /api/meetings/%s/speaker-labels/%s → %s", meeting_id, source, req.label)
    return saved


async def remove_meeting(meeting_id: str, current_user: CurrentUser) -> dict:
    await require_user_meeting(meeting_id, current_user)
    await delete_meeting(meeting_id)
    logger.info("DELETE /api/meetings/%s", meeting_id)
    return {"ok": True}


async def list_action_items(meeting_id: str, current_user: CurrentUser) -> list[dict]:
    await require_user_meeting(meeting_id, current_user)
    return await get_action_items(meeting_id)


async def save_action_items(meeting_id: str, req: ActionItemsPayload, current_user: CurrentUser) -> list[dict]:
    await require_user_meeting(meeting_id, current_user)
    items = await replace_action_items(meeting_id, [item.model_dump() for item in req.items])
    logger.info("PUT /api/meetings/%s/action-items → %d 条", meeting_id, len(items))
    return items


async def translate_meeting(meeting_id: str, current_user: CurrentUser) -> dict:
    meeting = await require_user_meeting(meeting_id, current_user)
    transcripts = meeting.get("transcripts", [])
    if not transcripts:
        return {"translated": 0}

    updated_segments = []
    translated_count = 0
    for seg in transcripts:
        payload = dict(seg)
        source_text = (payload.get("postprocessed_text") or payload.get("text") or "").strip()
        if source_text and not (payload.get("translated_text") or "").strip():
            payload["translated_text"] = (
                await summary_service.translate_transcript_text(source_text, get_llm_provider(), get_llm_model(), get_llm_api_key())
            ).strip()
            translated_count += 1
        updated_segments.append(payload)

    if translated_count:
        await save_transcripts(meeting_id, updated_segments)

    logger.info("POST /api/meetings/%s/translate → %d 条", meeting_id, translated_count)
    return {"translated": translated_count}


async def summarize_meeting(
    meeting_id: str,
    req: SummarizeRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
) -> dict:
    meeting = await require_user_meeting(meeting_id, current_user)
    await create_summary_pending(meeting_id)
    background_tasks.add_task(_do_summarize, meeting_id, meeting, req)
    return {"status": "processing"}


async def get_meeting_chapters(meeting_id: str, current_user: CurrentUser) -> dict:
    await require_user_meeting(meeting_id, current_user)
    cached = await get_chapters(meeting_id)
    if cached:
        return {"chapters": cached}
    # No cached chapters yet — generate and persist
    return await _generate_and_save_chapters(meeting_id, current_user)


async def extract_chapters(meeting_id: str, current_user: CurrentUser) -> dict:
    await require_user_meeting(meeting_id, current_user)
    return await _generate_and_save_chapters(meeting_id, current_user)


async def _generate_and_save_chapters(meeting_id: str, current_user: CurrentUser) -> dict:
    meeting = await require_user_meeting(meeting_id, current_user)
    transcripts = meeting.get("transcripts", [])
    if not transcripts:
        return {"chapters": []}
    try:
        chapters = await summary_service.generate_chapters(transcripts, get_llm_provider(), get_llm_model(), get_llm_api_key())
    except Exception as exc:
        logger.error("章节提取失败 %s: %s", meeting_id, exc)
        raise HTTPException(status_code=500, detail=f"章节提取失败: {str(exc)}")

    transcript_by_sequence = {}
    for seg in transcripts:
        sequence_id = seg.get("sequence_id")
        if sequence_id is not None and sequence_id not in transcript_by_sequence:
            transcript_by_sequence[sequence_id] = seg

    normalized = []
    for chapter in chapters:
        start_sequence_id = chapter["start_sequence_id"]
        segment = transcript_by_sequence.get(start_sequence_id)
        if not segment:
            continue
        normalized.append(
            {
                "id": uuid.uuid4().hex,
                "title": chapter["title"],
                "summary": chapter.get("summary", ""),
                "start_sequence_id": start_sequence_id,
                "start_segment_id": segment["id"],
                "start_timestamp": segment.get("timestamp", ""),
            }
        )
    await save_chapters(meeting_id, normalized)
    return {"chapters": normalized}


async def _do_summarize(meeting_id: str, meeting: dict, req: SummarizeRequest):
    provider = get_llm_provider()
    model = get_llm_model()
    api_key = get_llm_api_key()
    logger.info("摘要任务开始 %s provider=%s model=%s template=%s", meeting_id, provider, model, req.template_id)
    try:
        text = _build_summary_transcript(meeting.get("transcripts", []))
        notes = meeting.get("notes", [])
        template_content = None
        if req.template_id:
            tpl = await get_template(req.template_id)
            if tpl:
                template_content = tpl["content"]
        result = await summary_service.generate_summary(text, provider, model, api_key, template_content, notes)
        await update_summary(meeting_id, "completed", content=result)
        logger.info("摘要任务完成 %s", meeting_id)
    except Exception as exc:
        logger.error("摘要任务失败 %s: %s", meeting_id, exc)
        await update_summary(meeting_id, "failed", error=str(exc))


async def chat_with_meeting(
    meeting_id: str,
    req: MeetingChatRequest,
    current_user: CurrentUser,
) -> dict:
    meeting = await require_user_meeting(meeting_id, current_user)
    transcripts = meeting.get("transcripts", [])
    if not transcripts:
        return {"answer": "该会议暂无转写内容。", "citations": []}

    try:
        result = await meeting_agent.run_meeting_agent(
            meeting_data=meeting,
            question=req.question,
            history=[msg.model_dump() for msg in req.history],
            provider=get_llm_provider(),
            model=get_llm_model(),
            api_key=get_llm_api_key(),
        )
    except Exception as exc:
        logger.error("会议对话失败 %s: %s", meeting_id, exc)
        raise HTTPException(status_code=500, detail=f"对话失败: {str(exc)}")

    return result
