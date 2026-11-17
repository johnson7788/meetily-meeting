import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MeetingDetail } from '@/types'

const { getMeetingMock } = vi.hoisted(() => ({
  getMeetingMock: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  api: {
    getMeetings: vi.fn(),
    getMeeting: getMeetingMock,
  },
}))

import { useMeetingStore } from './meetingStore'

describe('useMeetingStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMeetingStore.setState({
      meetings: [],
      currentMeeting: null,
      loading: false,
    })
  })

  it('keeps the current meeting visible while refreshing its detail', async () => {
    const currentMeeting: MeetingDetail = {
      id: 'm1',
      title: '季度复盘',
      created_at: '2026-04-01T10:00:00Z',
      updated_at: '2026-04-01T10:00:00Z',
      transcripts: [],
      speaker_labels: [],
      action_items: [],
      summary: null,
    }
    let resolveRequest: (value: typeof currentMeeting) => void = () => {}
    getMeetingMock.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve
    }))
    useMeetingStore.setState({
      currentMeeting,
      loading: false,
    })

    const request = useMeetingStore.getState().fetchMeeting('m1')

    expect(useMeetingStore.getState().loading).toBe(true)
    expect(useMeetingStore.getState().currentMeeting).toBe(currentMeeting)

    const updatedMeeting = {
      ...currentMeeting,
      summary: {
        status: 'completed' as const,
        content: '## 会议概要\n继续推进。',
      },
    }
    resolveRequest(updatedMeeting)
    await request

    expect(useMeetingStore.getState().loading).toBe(false)
    expect(useMeetingStore.getState().currentMeeting).toBe(updatedMeeting)
  })

  it('clears stale detail when loading a different meeting', async () => {
    const currentMeeting: MeetingDetail = {
      id: 'm1',
      title: '季度复盘',
      created_at: '2026-04-01T10:00:00Z',
      updated_at: '2026-04-01T10:00:00Z',
      transcripts: [],
      speaker_labels: [],
      action_items: [],
      summary: null,
    }
    getMeetingMock.mockResolvedValue({
      ...currentMeeting,
      id: 'm2',
      title: '周会',
    })
    useMeetingStore.setState({
      currentMeeting,
      loading: false,
    })

    const request = useMeetingStore.getState().fetchMeeting('m2')

    expect(useMeetingStore.getState().loading).toBe(true)
    expect(useMeetingStore.getState().currentMeeting).toBeNull()

    await request
    expect(useMeetingStore.getState().currentMeeting?.id).toBe('m2')
  })
})
