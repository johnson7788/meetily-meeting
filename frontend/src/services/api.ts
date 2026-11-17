import type {
  ActionItem,
  Meeting,
  MeetingChapter,
  MeetingChatResponse,
  MeetingChatRequestPayload,
  MeetingDetail,
  RecordingMeetingMetadata,
  SpeakerLabel,
  TranscriptSegment,
  Template,
} from '@/types'
import { resolveApiBase } from './api-base'

const BASE = resolveApiBase(window.location.href, import.meta.env.VITE_API_BASE as string | undefined)

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${BASE}${path}`, {
    headers,
    credentials: 'omit',
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

function buildUploadErrorMessage(detail: string | undefined, status: number, statusText: string) {
  if (detail?.trim()) return detail
  return `上传失败（${status} ${statusText}）`
}

function normalizeUploadRequestError(error: unknown) {
  if (error instanceof Error && error.message === 'Failed to fetch') {
    return new Error('上传请求失败，请检查网络、文件格式或重新登录后重试。')
  }
  return error instanceof Error ? error : new Error('上传失败')
}

export const api = {
  getMeetings: () => req<Meeting[]>('/api/meetings'),

  getMeeting: (id: string) => req<MeetingDetail>(`/api/meetings/${id}`),

  extractChapters: (meetingId: string) =>
    req<{ chapters: MeetingChapter[] }>(`/api/meetings/${meetingId}/chapters`, {
      method: 'GET',
    }),

  regenerateChapters: (meetingId: string) =>
    req<{ chapters: MeetingChapter[] }>(`/api/meetings/${meetingId}/chapters`, {
      method: 'POST',
    }),

  translateMeeting: (meetingId: string) =>
    req<{ translated: number }>(`/api/meetings/${meetingId}/translate`, {
      method: 'POST',
    }),

  saveMeeting: (meetingId: string, title: string, segments: TranscriptSegment[], hotWords?: string, projectName?: string, notes?: Array<{ content: string; timestamp: string }>) =>
    req<{ meeting_id: string }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify({ meeting_id: meetingId, title, project_name: projectName ?? null, hot_words: hotWords ?? null, segments, notes: notes ?? [] }),
    }),

  saveRecordedMeeting: async (
    file: File,
    meetingId: string,
    title: string,
    segments: TranscriptSegment[],
    metadata?: RecordingMeetingMetadata,
  ): Promise<{ meeting_id: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('meeting_id', meetingId)
    formData.append('title', title)
    formData.append('raw_segments', JSON.stringify(segments))
    if (metadata?.projectName) formData.append('project_name', metadata.projectName)
    if (metadata?.hotWords) formData.append('hot_words', metadata.hotWords)

    try {
      const res = await fetch(`${BASE}/api/meetings/recorded`, {
        method: 'POST',
        body: formData,
        credentials: 'omit',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '' }))
        throw new Error(buildUploadErrorMessage((err as { detail?: string }).detail, res.status, res.statusText))
      }
      return res.json() as Promise<{ meeting_id: string }>
    } catch (error) {
      throw normalizeUploadRequestError(error)
    }
  },

  deleteMeeting: (id: string) =>
    req<{ ok: boolean }>(`/api/meetings/${id}`, { method: 'DELETE' }),

  getActionItems: (meetingId: string) => req<ActionItem[]>(`/api/meetings/${meetingId}/action-items`),

  saveActionItems: (meetingId: string, items: ActionItem[]) =>
    req<ActionItem[]>(`/api/meetings/${meetingId}/action-items`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }),

  updateTitle: (id: string, title: string) =>
    req<{ ok: boolean }>(`/api/meetings/${id}/title`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    }),

  updateSpeakerLabel: (meetingId: string, source: string, label: string) =>
    req<SpeakerLabel[]>(`/api/meetings/${meetingId}/speaker-labels/${encodeURIComponent(source)}`, {
      method: 'PUT',
      body: JSON.stringify({ source, label }),
    }),

  summarize: (meetingId: string, templateId?: string) =>
    req<{ status: string }>(`/api/meetings/${meetingId}/summarize`, {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId ?? null }),
    }),

  realtimeSummarize: (transcript: string, notes?: Array<{ content: string; timestamp: string }>) =>
    req<{ summary: string; ok: boolean }>('/api/realtime/summarize', {
      method: 'POST',
      body: JSON.stringify({ transcript, notes: notes ?? [] }),
    }),

  getTemplates: () => req<Template[]>('/api/templates'),
  createTemplate: (name: string, content: string) =>
    req<Template>('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name, content }),
    }),
  updateTemplate: (id: string, name: string, content: string) =>
    req<{ ok: boolean }>(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, content }),
    }),
  deleteTemplate: (id: string) =>
    req<{ ok: boolean }>(`/api/templates/${id}`, { method: 'DELETE' }),

  uploadMeeting: async (file: File, title?: string, projectName?: string): Promise<{ meeting_id: string; title: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    if (title) formData.append('title', title)
    if (projectName) formData.append('project_name', projectName)
    try {
      const res = await fetch(`${BASE}/api/meetings/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'omit',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '' }))
        throw new Error(buildUploadErrorMessage((err as { detail?: string }).detail, res.status, res.statusText))
      }
      return res.json() as Promise<{ meeting_id: string; title: string }>
    } catch (error) {
      throw normalizeUploadRequestError(error)
    }
  },

  chatWithMeeting: (meetingId: string, payload: MeetingChatRequestPayload) =>
    req<MeetingChatResponse>(`/api/meetings/${meetingId}/chat`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
