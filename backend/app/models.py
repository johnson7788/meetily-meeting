from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class TranscriptSegment(BaseModel):
    id: str
    text: str
    postprocessed_text: Optional[str] = None
    translated_text: Optional[str] = None
    timestamp: str
    source: Optional[str] = None
    sequence_id: Optional[int] = None
    confidence: Optional[float] = None
    audio_start_time: Optional[float] = None
    audio_end_time: Optional[float] = None
    duration: Optional[float] = None


class NoteItem(BaseModel):
    content: str
    timestamp: str


class DiarizedTranscriptSegment(BaseModel):
    id: str
    text: str
    timestamp: str
    source: str
    is_partial: int = 0
    sequence_id: Optional[int] = None
    confidence: Optional[float] = None
    audio_start_time: Optional[float] = None
    audio_end_time: Optional[float] = None
    duration: Optional[float] = None

class SaveMeetingRequest(BaseModel):
    meeting_id: str
    title: str
    project_name: Optional[str] = None
    hot_words: Optional[str] = None
    segments: List[TranscriptSegment]
    notes: List[NoteItem] = []

class SpeakerLabelPayload(BaseModel):
    source: str
    label: str

class UpdateTitleRequest(BaseModel):
    title: str

class SummarizeRequest(BaseModel):
    template_id: Optional[str] = None  # 为空则使用默认会议摘要模板

class RealtimeSummaryRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=50000)
    notes: List[NoteItem] = []

class ActionItem(BaseModel):
    id: Optional[str] = None
    task: str
    owner: Optional[str] = None
    due: Optional[str] = None
    done: bool = False
    position: Optional[int] = None

class ActionItemsPayload(BaseModel):
    items: List[ActionItem]

class TemplateRequest(BaseModel):
    name: str
    content: str



class MeetingChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class MeetingChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[MeetingChatMessage] = []


class MeetingChatCitation(BaseModel):
    segment_id: str
    text: str
    speaker_label: Optional[str] = None
    timestamp: Optional[str] = None


class MeetingChatResponse(BaseModel):
    answer: str
    citations: list[MeetingChatCitation] = []
