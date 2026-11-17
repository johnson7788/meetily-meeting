import { create } from 'zustand'
import type { TranscriptSegment } from '@/types'

const SPEAKER_COLORS = [
  '#2563eb', '#16a34a', '#ea580c', '#7c3aed',
  '#db2777', '#0891b2', '#ca8a04', '#dc2626',
]

interface SpeakerInfo {
  id: string
  label: string
  color: string
}

interface TranscriptState {
  segments: TranscriptSegment[]
  partialText: string
  speakers: Record<string, SpeakerInfo>
  addUpdate: (text: string, isPartial: boolean, sequenceId: number, source?: string) => void
  setSegments: (segments: TranscriptSegment[]) => void
  clearAll: () => void
  clearPartial: () => void
  getSpeaker: (source: string) => SpeakerInfo
}

export const useTranscriptStore = create<TranscriptState>((set, get) => ({
  segments: [],
  partialText: '',
  speakers: {},

  getSpeaker: (source: string): SpeakerInfo => {
    const { speakers } = get()
    if (speakers[source]) return speakers[source]
    const match = source.match(/(\d+)$/)
    const idx = match ? parseInt(match[1], 10) : Object.keys(speakers).length
    const info: SpeakerInfo = {
      id: source,
      label: `说话人${idx + 1}`,
      color: SPEAKER_COLORS[idx % SPEAKER_COLORS.length],
    }
    set((s) => ({ speakers: { ...s.speakers, [source]: info } }))
    return info
  },

  addUpdate: (text, isPartial, sequenceId, source) => {
    if (source) get().getSpeaker(source)
    if (isPartial) {
      set({ partialText: text })
    } else {
      const seg: TranscriptSegment = {
        id: `rt-${sequenceId}`,
        text,
        timestamp: new Date().toISOString(),
        source,
        sequence_id: sequenceId,
      }
      set((s) => ({ segments: [...s.segments, seg], partialText: '' }))
    }
  },

  setSegments: (segments) => {
    const speakers: Record<string, SpeakerInfo> = {}
    segments.forEach((seg) => {
      if (seg.source && !speakers[seg.source]) {
        const match = seg.source.match(/(\d+)$/)
        const idx = match ? parseInt(match[1], 10) : Object.keys(speakers).length
        speakers[seg.source] = {
          id: seg.source,
          label: `说话人${idx + 1}`,
          color: SPEAKER_COLORS[idx % SPEAKER_COLORS.length],
        }
      }
    })
    set({ segments, speakers, partialText: '' })
  },

  clearAll: () => set({ segments: [], partialText: '', speakers: {} }),
  clearPartial: () => set({ partialText: '' }),
}))
