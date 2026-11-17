from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile

from ...api.deps.auth import CurrentUser, get_current_user
from ...models import ActionItemsPayload, MeetingChatRequest, SaveMeetingRequest, SpeakerLabelPayload, SummarizeRequest, UpdateTitleRequest
from ...services import meeting_service

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


@router.get("")
async def list_meetings(current_user: CurrentUser = Depends(get_current_user)):
    return await meeting_service.list_meetings(current_user)


@router.get("/{meeting_id}")
async def meeting_detail(meeting_id: str, current_user: CurrentUser = Depends(get_current_user)):
    return await meeting_service.get_meeting_detail(meeting_id, current_user)


@router.post("")
async def save_meeting(req: SaveMeetingRequest, current_user: CurrentUser = Depends(get_current_user)):
    return await meeting_service.save_meeting(req, current_user)


@router.post("/upload")
async def upload_meeting(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    project_name: str | None = Form(None),
    current_user: CurrentUser = Depends(get_current_user),
):
    return await meeting_service.upload_meeting(file, title, project_name, current_user)


@router.post("/recorded")
async def save_recorded_meeting(
    file: UploadFile = File(...),
    meeting_id: str = Form(...),
    title: str = Form(...),
    raw_segments: str = Form("[]"),
    project_name: str | None = Form(None),
    current_user: CurrentUser = Depends(get_current_user),
):
    return await meeting_service.save_recorded_meeting(file, meeting_id, title, raw_segments, project_name, current_user)


@router.put("/{meeting_id}/title")
async def rename_meeting(meeting_id: str, req: UpdateTitleRequest, current_user: CurrentUser = Depends(get_current_user)):
    return await meeting_service.rename_meeting(meeting_id, req, current_user)


@router.put("/{meeting_id}/speaker-labels/{source}")
async def rename_speaker_label(meeting_id: str, source: str, req: SpeakerLabelPayload, current_user: CurrentUser = Depends(get_current_user)):
    return await meeting_service.rename_speaker_label(meeting_id, source, req, current_user)


@router.delete("/{meeting_id}")
async def remove_meeting(meeting_id: str, current_user: CurrentUser = Depends(get_current_user)):
    return await meeting_service.remove_meeting(meeting_id, current_user)


@router.get("/{meeting_id}/action-items")
async def list_action_items(meeting_id: str, current_user: CurrentUser = Depends(get_current_user)):
    return await meeting_service.list_action_items(meeting_id, current_user)


@router.put("/{meeting_id}/action-items")
async def save_action_items(meeting_id: str, req: ActionItemsPayload, current_user: CurrentUser = Depends(get_current_user)):
    return await meeting_service.save_action_items(meeting_id, req, current_user)


@router.post("/{meeting_id}/translate")
async def translate_meeting(meeting_id: str, current_user: CurrentUser = Depends(get_current_user)):
    return await meeting_service.translate_meeting(meeting_id, current_user)


@router.post("/{meeting_id}/summarize")
async def summarize_meeting(
    meeting_id: str,
    req: SummarizeRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
):
    return await meeting_service.summarize_meeting(meeting_id, req, background_tasks, current_user)


@router.get("/{meeting_id}/chapters")
async def get_chapters(meeting_id: str, current_user: CurrentUser = Depends(get_current_user)):
    return await meeting_service.get_meeting_chapters(meeting_id, current_user)


@router.post("/{meeting_id}/chapters")
async def extract_chapters(meeting_id: str, current_user: CurrentUser = Depends(get_current_user)):
    return await meeting_service.extract_chapters(meeting_id, current_user)


@router.post("/{meeting_id}/chat")
async def chat_with_meeting(
    meeting_id: str,
    req: MeetingChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    return await meeting_service.chat_with_meeting(meeting_id, req, current_user)
