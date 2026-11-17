import { render, screen, waitFor } from '@testing-library/react'
import { within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MeetingDetailPage from './meeting-detail'
import type { MeetingDetail } from '@/types'

const { fetchMeeting, mockMeeting, updateTitle, updateSpeakerLabel, extractChapters, translateMeeting } = vi.hoisted(() => {
  const meeting: MeetingDetail = {
    id: 'm1',
    title: '季度复盘',
    project_name: 'Alpha 项目',
    created_at: '2026-04-01T10:00:00Z',
    updated_at: '2026-04-01T10:00:00Z',
    transcripts: [
      {
        id: 't1',
        text: '先过一下本季度的核心指标。',
        timestamp: '0',
        source: 'spk_0',
        postprocessed_text: '先过一下本季度的核心指标。',
        translated_text: '',
      },
      {
        id: 't2',
        text: '我们重点看 AI 平 台 的落地情况。',
        timestamp: '5',
        source: 'spk_1',
        postprocessed_text: '我们重点看 AI 平台 的落地情况。',
        translated_text: 'We will focus on the deployment of the AI platform.',
      },
    ],
    speaker_labels: [
      { source: 'spk_0', label: '产品' },
      { source: 'spk_1', label: '研发' },
    ],
    action_items: [],
    summary: null,
  }

  return {
    fetchMeeting: vi.fn(),
    extractChapters: vi.fn(async () => ({
      chapters: [
        {
          id: 'c1',
          title: '开场与目标',
          summary: '确认本季度的核心目标。',
          start_sequence_id: 0,
          start_segment_id: 't1',
          start_timestamp: '0',
        },
      ],
    })),
    translateMeeting: vi.fn(async () => ({ translated: 2 })),
    mockMeeting: meeting,
    updateTitle: vi.fn(async (_id: string, title: string) => {
      meeting.title = title
      return { ok: true }
    }),
    updateSpeakerLabel: vi.fn(async (_meetingId: string, source: string, label: string) => {
      const item = meeting.speaker_labels.find((speaker) => speaker.source === source)
      if (item) item.label = label
      else meeting.speaker_labels.push({ source, label })
      return meeting.speaker_labels
    }),
  }
})

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ meetingId: 'm1' }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/services/api', () => ({
  api: {
    extractChapters,
    updateTitle,
    updateSpeakerLabel,
    translateMeeting,
  },
}))

vi.mock('@/store/meetingStore', () => ({
  useMeetingStore: (selector: (state: unknown) => unknown) =>
    selector({
      currentMeeting: mockMeeting,
      loading: false,
      fetchMeeting,
    }),
}))

vi.mock('@/components/summary/SummaryPanel', () => ({
  default: () => <div>SummaryPanel</div>,
}))

vi.mock('@/components/summary/ActionItemsPanel', () => ({
  default: () => <div>ActionItemsPanel</div>,
}))

describe('MeetingDetailPage', () => {
  beforeEach(() => {
    localStorage.clear()
    mockMeeting.title = '季度复盘'
    mockMeeting.project_name = 'Alpha 项目'
    mockMeeting.transcripts = [
      {
        id: 't1',
        text: '先过一下本季度的核心指标。',
        timestamp: '0',
        source: 'spk_0',
        postprocessed_text: '先过一下本季度的核心指标。',
        translated_text: '',
      },
      {
        id: 't2',
        text: '我们重点看 AI 平 台 的落地情况。',
        timestamp: '5',
        source: 'spk_1',
        postprocessed_text: '我们重点看 AI 平台 的落地情况。',
        translated_text: 'We will focus on the deployment of the AI platform.',
      },
    ]
    mockMeeting.speaker_labels = [
      { source: 'spk_0', label: '产品' },
      { source: 'spk_1', label: '研发' },
    ]
    mockMeeting.action_items = []
    mockMeeting.summary = null
    fetchMeeting.mockReset()
    extractChapters.mockClear()
    updateTitle.mockClear()
    updateSpeakerLabel.mockClear()
    translateMeeting.mockClear()
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('saves the edited meeting title from the detail header', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MeetingDetailPage />)

    await user.click(screen.getByRole('button', { name: '季度复盘' }))
    const input = screen.getByRole('textbox', { name: '会议标题' })
    await user.clear(input)
    await user.type(input, '新的会议标题{enter}')

    await waitFor(() => expect(updateTitle).toHaveBeenCalledWith('m1', '新的会议标题'))

    rerender(<MeetingDetailPage />)
    expect(screen.getByRole('button', { name: '新的会议标题' })).toBeInTheDocument()
  })

  it('renames a speaker label and keeps it after refresh', async () => {
    const user = userEvent.setup()
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('市场')
    const { rerender } = render(<MeetingDetailPage />)

    await user.click(screen.getAllByRole('button', { name: '产品' })[0])

    await waitFor(() => expect(updateSpeakerLabel).toHaveBeenCalledWith('m1', 'spk_0', '市场'))
    rerender(<MeetingDetailPage />)
    expect(screen.getByRole('button', { name: '市场' })).toBeInTheDocument()
    promptSpy.mockRestore()
  })

  it('shows term correction output without replacing the original transcript', async () => {
    render(<MeetingDetailPage />)

    const transcript = within(document.getElementById('t2') as HTMLElement)
    expect(transcript.getByText('我们重点看 AI 平 台 的落地情况。')).toBeInTheDocument()
    expect(transcript.getByText('我们重点看 AI 平台 的落地情况。')).toBeInTheDocument()
    expect(transcript.getByText('术语校正')).toBeInTheDocument()
  })

  it('shows translated transcript text alongside the original when the switch is enabled', async () => {
    mockMeeting.transcripts = [
      {
        id: 't1',
        text: 'We will focus on the roadmap.',
        timestamp: '0',
        source: 'spk_0',
        postprocessed_text: '',
        translated_text: '我们将重点关注路线图。',
      },
    ]

    const user = userEvent.setup()
    render(<MeetingDetailPage />)

    await user.click(screen.getAllByRole('button', { name: '英转中：关' })[0])

    const transcript = within(document.getElementById('t1') as HTMLElement)
    expect(transcript.getByText('We will focus on the roadmap.')).toBeInTheDocument()
    expect(transcript.getByText('我们将重点关注路线图。')).toBeInTheDocument()
    expect(transcript.getByText('中文译文')).toBeInTheDocument()
  })

  it('renders relative mm:ss timestamps without showing invalid date', () => {
    mockMeeting.transcripts = [
      {
        id: 't1',
        text: '先过一下本季度的目标。',
        timestamp: '00:00',
        source: 'speaker_1',
      },
      {
        id: 't2',
        text: '我补充一下交付风险。',
        timestamp: '00:02',
        source: 'speaker_2',
      },
    ]
    mockMeeting.speaker_labels = [
      { source: 'speaker_1', label: '说话人1' },
      { source: 'speaker_2', label: '说话人2' },
    ]

    render(<MeetingDetailPage />)

    expect(screen.getAllByText('00:00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('00:02').length).toBeGreaterThan(0)
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument()
  })

  it('uses a natural page layout instead of locking the detail page to full-height panes', () => {
    render(<MeetingDetailPage />)

    screen.getAllByTestId('meeting-detail-layout').forEach((element) => {
      expect(element).toHaveClass('min-h-full')
      expect(element).not.toHaveClass('h-full')
    })
    screen.getAllByTestId('meeting-detail-content').forEach((element) => {
      expect(element).not.toHaveClass('overflow-hidden')
    })
    screen.getAllByTestId('meeting-detail-title-button').forEach((element) => {
      expect(element).not.toHaveClass('truncate')
    })
  })

  it('gives the summary sidebar a wider desktop column', () => {
    render(<MeetingDetailPage />)

    screen.getAllByTestId('meeting-detail-content').forEach((element) => {
      expect(element).toHaveClass('xl:grid-cols-[minmax(0,1fr)_420px]')
      expect(element).toHaveClass('2xl:grid-cols-[minmax(0,1fr)_460px]')
    })
    screen.getAllByTestId('meeting-detail-sidebar').forEach((element) => {
      expect(element.className).toContain('meeting-detail-sidebar-scroll')
    })
  })

  it('keeps action items above the summary in the desktop sidebar', () => {
    render(<MeetingDetailPage />)

    const sidebar = screen.getAllByTestId('meeting-detail-sidebar')[0]
    const actionItems = within(sidebar).getByText('ActionItemsPanel')
    const summary = within(sidebar).getByText('SummaryPanel')

    expect(actionItems.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('makes the desktop summary sidebar independently scrollable without affecting mobile flow', () => {
    render(<MeetingDetailPage />)

    screen.getAllByTestId('meeting-detail-sidebar').forEach((element) => {
      expect(element.className).toContain('meeting-detail-sidebar-scroll')
      expect(element).not.toHaveClass('overflow-y-auto')
      expect(element).not.toHaveClass('overscroll-contain')
    })
  })

  it('keeps the detail page text selectable for copying and pasting', () => {
    const { container } = render(<MeetingDetailPage />)

    screen.getAllByTestId('meeting-detail-layout').forEach((element) => {
      expect(element).toHaveClass('select-text')
      expect(element).not.toHaveClass('select-none')
    })
    screen.getAllByTestId('meeting-detail-content').forEach((element) => {
      expect(element).toHaveClass('select-text')
      expect(element).not.toHaveClass('select-none')
    })
    container.querySelectorAll('section').forEach((element) => {
      expect(element).toHaveClass('select-text')
      expect(element).not.toHaveClass('select-none')
    })
  })

  it('renders a denser chapter navigation with tighter vertical spacing', () => {
    render(<MeetingDetailPage />)

    const chapterButton = screen.getAllByRole('button', { name: /开场与目标/ })[0]
    expect(chapterButton).toHaveClass('py-1.5')
    expect(chapterButton).toHaveClass('text-left')
    expect(screen.getAllByText('时间导航')[0]).toHaveClass('text-xs')
  })

  it('requests translation when the switch is enabled and transcripts are missing translated text', async () => {
    const user = userEvent.setup()
    render(<MeetingDetailPage />)

    await user.click(screen.getAllByRole('button', { name: '英转中：关' })[0])

    await waitFor(() => expect(translateMeeting).toHaveBeenCalledWith('m1'))
  })

  it('scrolls to the transcript segment when a chapter is selected', async () => {
    const user = userEvent.setup()
    render(<MeetingDetailPage />)

    await user.click(screen.getAllByRole('button', { name: /开场与目标/ })[0])

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('exports a concise meeting minutes markdown file', async () => {
    const user = userEvent.setup()
    mockMeeting.title = '季度复盘'
    mockMeeting.project_name = 'Alpha 项目'
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    let exportedMarkdown = ''
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        const reader = new FileReader()
        reader.onload = () => {
          exportedMarkdown = String(reader.result ?? '')
        }
        reader.readAsText(blob)
        return 'blob:mock'
      }),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })

    mockMeeting.action_items = [
      {
        id: 'a1',
        task: '确认发布排期',
        owner: '产品',
        due: '2026-04-05',
        done: false,
        position: 0,
      },
    ]
    mockMeeting.summary = {
      status: 'completed',
      content: '## 会议概要\n本次会议围绕季度目标复盘展开。',
    }

    render(<MeetingDetailPage />)

    const originalCreateElement = document.createElement.bind(document)
    const anchor = {
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') return anchor
      return originalCreateElement(tagName)
    })

    await user.click(screen.getAllByRole('button', { name: '导出 MD' })[0])

    await waitFor(() => expect(anchor.click).toHaveBeenCalled())

    expect(anchor.download).toBe('会议-2026-04-01-m1.md')
    expect(exportedMarkdown).toMatch(/^# .+/)
    expect(exportedMarkdown).not.toContain('title: "')
    expect(exportedMarkdown).not.toContain('tags:')
    expect(exportedMarkdown).not.toContain('## 文档信息')
    expect(exportedMarkdown).not.toContain('## 目录')
    expect(exportedMarkdown).not.toContain('## 章节速览')
    expect(exportedMarkdown).not.toContain('## 完整转写')
    expect(exportedMarkdown).toContain('本次会议围绕季度目标复盘展开。')
    expect(exportedMarkdown).toContain('## 待办事项')
    expect(exportedMarkdown).toContain('确认发布排期')
    expect(exportedMarkdown).not.toContain('| 序号 | 时间 | 说话人 | 内容 |')
    expect(exportedMarkdown).not.toContain('术语校正：')
    expect(exportedMarkdown).not.toContain('中文译文：')

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    })
    createElementSpy.mockRestore()
  })
})
