export type RecordingStatus =
  | 'idle'
  | 'connecting'
  | 'recording'
  | 'stopping'
  | 'processing'

export type RecordingSource = 'mic' | 'system'

export interface RecordingStartOptions {
  source: RecordingSource
  micDeviceId?: string
  hotWords?: string
}

export interface RecordingStopResult {
  audioFile?: File
}

export interface TranscriptSegment {
  id: string
  text: string
  postprocessed_text?: string | null
  translated_text?: string | null
  timestamp: string
  source?: string
  sequence_id?: number
  confidence?: number
  audio_start_time?: number
  audio_end_time?: number
  duration?: number
}

export interface SpeakerLabel {
  source: string
  label: string
  created_at?: string
  updated_at?: string
}

export interface WsTranscriptMessage {
  type: 'transcript'
  text: string
  is_partial: boolean
  sequence_id: number
}

export interface WsDoneMessage {
  type: 'done'
}

export interface WsErrorMessage {
  type: 'error'
  message: string
}

export type WsMessage = WsTranscriptMessage | WsDoneMessage | WsErrorMessage

export interface Meeting {
  id: string
  title: string
  project_name?: string | null
  created_at: string
  updated_at: string
}

export interface ActionItem {
  id: string
  task: string
  owner?: string | null
  due?: string | null
  done: boolean
  position?: number
  created_at?: string
  updated_at?: string
}

export interface MeetingChapter {
  id: string
  title: string
  summary: string
  start_sequence_id: number
  start_segment_id: string
  start_timestamp: string
}

export interface MeetingNote {
  id: string
  content: string
  timestamp: string
}

export interface MeetingDetail extends Meeting {
  transcripts: TranscriptSegment[]
  speaker_labels: SpeakerLabel[]
  chapters?: MeetingChapter[]
  notes: MeetingNote[]
  summary: {
    status: 'pending' | 'completed' | 'failed'
    content?: string
    error?: string
  } | null
  action_items: ActionItem[]
}

export interface Template {
  id: string
  name: string
  content: string
  created_at: string
}

export interface RecordingMeetingMetadata {
  projectName?: string
  hotWords?: string
}

// Meeting Chat
export interface MeetingChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'summary'
  content: string
  citations?: MeetingChatCitation[]
  timestamp?: string
}

export interface MeetingChatCitation {
  segment_id: string
  text: string
  speaker_label?: string | null
  timestamp?: string | null
}

export interface MeetingChatResponse {
  answer: string
  citations: MeetingChatCitation[]
}

export interface MeetingChatRequestPayload {
  question: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}

