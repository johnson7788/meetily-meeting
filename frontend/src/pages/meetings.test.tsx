import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MeetingsPage from './meetings'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/services/api', () => ({
  api: {
    deleteMeeting: vi.fn(),
  },
}))

vi.mock('@/store/meetingStore', () => ({
  useMeetingStore: (selector: (state: unknown) => unknown) =>
    selector({
      meetings: [
        {
          id: 'm1',
          title: '产品周会',
          project_name: 'Alpha 项目',
          created_at: '2026-04-01T10:00:00Z',
          updated_at: '2026-04-01T10:30:00Z',
        },
        {
          id: 'm2',
          title: '临时沟通',
          project_name: null,
          created_at: '2026-04-01T11:00:00Z',
          updated_at: '2026-04-01T11:30:00Z',
        },
      ],
      loading: false,
      fetchMeetings: vi.fn(),
      removeMeeting: vi.fn(),
    }),
}))

describe('MeetingsPage', () => {
  const originalScrollY = window.scrollY
  const scrollToMock = vi.fn()

  beforeEach(() => {
    scrollToMock.mockReset()
    sessionStorage.clear()
    Object.defineProperty(window, 'scrollTo', {
      value: scrollToMock,
      writable: true,
    })
  })

  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    Object.defineProperty(window, 'scrollY', {
      value: originalScrollY,
      writable: true,
      configurable: true,
    })
  })

  it('renders a flat history list without showing an unclassified group badge', () => {
    render(<MeetingsPage />)

    expect(screen.getByText('产品周会')).toBeInTheDocument()
    expect(screen.getByText('临时沟通')).toBeInTheDocument()
    expect(screen.queryByText('未分类')).not.toBeInTheDocument()
  })

  it('allows long meeting titles to wrap inside the list card instead of truncating', () => {
    render(<MeetingsPage />)

    screen.getAllByTestId('meeting-list-title-m1').forEach((element) => {
      expect(element).not.toHaveClass('truncate')
      expect(element).toHaveClass('break-words')
    })
  })

  it('restores the last meeting list scroll position after returning', async () => {
    sessionStorage.setItem('meetily:meetings-scroll-y', '860')

    render(<MeetingsPage />)

    await waitFor(() =>
      expect(scrollToMock).toHaveBeenCalledWith({
        top: 860,
        behavior: 'auto',
      }),
    )
  })
})
