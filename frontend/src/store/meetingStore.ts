import { create } from 'zustand'
import type { Meeting, MeetingDetail } from '@/types'
import { api } from '@/services/api'

interface MeetingState {
  meetings: Meeting[]
  currentMeeting: MeetingDetail | null
  loading: boolean
  fetchMeetings: () => Promise<void>
  fetchMeeting: (id: string) => Promise<void>
  removeMeeting: (id: string) => void
}

let latestMeetingRequestId = 0

export const useMeetingStore = create<MeetingState>((set) => ({
  meetings: [],
  currentMeeting: null,
  loading: false,

  fetchMeetings: async () => {
    set({ loading: true })
    try {
      const meetings = await api.getMeetings()
      set({ meetings })
    } finally {
      set({ loading: false })
    }
  },

  fetchMeeting: async (id) => {
    const requestId = ++latestMeetingRequestId
    set((state) => ({
      loading: true,
      currentMeeting: state.currentMeeting?.id === id ? state.currentMeeting : null,
    }))
    try {
      const meeting = await api.getMeeting(id)
      set((state) => (requestId === latestMeetingRequestId ? { ...state, currentMeeting: meeting } : state))
    } finally {
      set((state) => (requestId === latestMeetingRequestId ? { ...state, loading: false } : state))
    }
  },

  removeMeeting: (id) =>
    set((s) => ({ meetings: s.meetings.filter((m) => m.id !== id) })),
}))
