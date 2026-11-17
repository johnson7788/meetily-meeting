import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SummaryPanel from './SummaryPanel'

const { getTemplates, summarize } = vi.hoisted(() => ({
  getTemplates: vi.fn(async () => []),
  summarize: vi.fn(async () => ({ status: 'processing' })),
}))

vi.mock('@/services/api', () => ({
  api: {
    getTemplates,
    summarize,
  },
}))

describe('SummaryPanel', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    getTemplates.mockClear()
    summarize.mockClear()
  })

  it('renders the current template summary and generate action', () => {
    render(
      <SummaryPanel
        meeting={
          {
            id: 'm1',
            title: '季度复盘',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: null,
            speaker_labels: [],
            action_items: [],
          } as never
        }
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('当前模板')).toBeInTheDocument()
    expect(screen.getByText('适合通用会议，覆盖概要、讨论点、决策与待跟进。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开模板' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '生成默认会议纪要' })).toBeInTheDocument()
  })

  it('copies the completed summary content to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText,
      },
      configurable: true,
    })

    render(
      <SummaryPanel
        meeting={
          {
            id: 'm1',
            title: '季度复盘',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: {
              status: 'completed',
              content: '### 结论\n\n- 继续推进',
              error: null,
            },
            speaker_labels: [],
            action_items: [],
          } as never
        }
        onRefresh={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '复制纪要' }))

    expect(writeText).toHaveBeenCalledWith('### 结论\n\n- 继续推进')
    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument()
  })

  it('makes the summary result area independently scrollable on desktop', () => {
    render(
      <SummaryPanel
        meeting={
          {
            id: 'm1',
            title: '季度复盘',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: {
              status: 'completed',
              content: '### 很长的纪要\n\n- 第一条\n- 第二条',
              error: null,
            },
            speaker_labels: [],
            action_items: [],
          } as never
        }
        onRefresh={vi.fn()}
      />,
    )

    const contentScrollArea = screen.getByTestId('summary-panel-content')
    const resultScrollArea = screen.getByTestId('summary-result-scroll')
    const contentClassNames = contentScrollArea.className.split(/\s+/)

    expect(contentScrollArea.className).toContain('xl:flex-1')
    expect(contentScrollArea.className).toContain('xl:overflow-y-auto')
    expect(contentScrollArea.className).toContain('xl:overscroll-contain')
    expect(contentClassNames).not.toContain('overflow-y-auto')
    expect(resultScrollArea.className).toBe('')
  })

  it('uses stacked template controls inside the summary sidebar', () => {
    render(
      <SummaryPanel
        meeting={
          {
            id: 'm1',
            title: '季度复盘',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: null,
            speaker_labels: [],
            action_items: [],
          } as never
        }
        onRefresh={vi.fn()}
      />,
    )

    const toggleButton = screen.getByRole('button', { name: '展开模板' })
    const templateControls = screen.getByRole('button', { name: '生成默认会议纪要' }).parentElement

    expect(toggleButton.className).toContain('w-full')
    expect(toggleButton.className).not.toContain('sm:w-auto')
    expect(templateControls?.className).toContain('grid-cols-1')
    expect(templateControls?.className).not.toContain('sm:grid-cols-[minmax(0,1fr)_auto]')
  })

  it('hides the custom template selector when there are no custom templates', () => {
    render(
      <SummaryPanel
        meeting={
          {
            id: 'm1',
            title: '季度复盘',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: null,
            speaker_labels: [],
            action_items: [],
          } as never
        }
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.queryByText('暂无自定义模板')).not.toBeInTheDocument()
    expect(screen.queryByText('选择自定义模板')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '生成默认会议纪要' })).toBeInTheDocument()
  })

  it('keeps the expanded template list independently scrollable', async () => {
    const user = userEvent.setup()

    render(
      <SummaryPanel
        meeting={
          {
            id: 'm1',
            title: '季度复盘',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: null,
            speaker_labels: [],
            action_items: [],
          } as never
        }
        onRefresh={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '展开模板' }))

    expect(screen.getByTestId('summary-templates-scroll').className).toContain('summary-templates-scroll')
  })

  it('locks template switching controls while summary generation is pending', async () => {
    const user = userEvent.setup()

    render(
      <SummaryPanel
        meeting={
          {
            id: 'm-pending',
            title: '生成中的会议',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: {
              status: 'pending',
              content: '',
              error: null,
            },
            speaker_labels: [],
            action_items: [],
          } as never
        }
        onRefresh={vi.fn()}
      />,
    )

    const toggleButton = screen.getByRole('button', { name: '展开模板' })
    expect(toggleButton).toBeDisabled()
    expect(screen.getByRole('button', { name: '生成默认会议纪要' })).toBeDisabled()

    await user.click(toggleButton)
    expect(screen.queryByTestId('summary-templates-scroll')).not.toBeInTheDocument()

    expect(screen.queryByText('选择自定义模板')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('生成中，请稍候...')).toBeInTheDocument()
  })
})
