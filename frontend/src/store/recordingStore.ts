import { create } from 'zustand'
import type { RecordingStatus } from '@/types'

interface RecordingState {
  status: RecordingStatus
  errorMessage: string
  setStatus: (status: RecordingStatus, errorMessage?: string) => void
}

export const useRecordingStore = create<RecordingState>((set) => ({
  status: 'idle',
  errorMessage: '',
  setStatus: (status, errorMessage = '') => set({ status, errorMessage }),
}))
