import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ActionItemsPanel from './ActionItemsPanel'

const { saveActionItems } = vi.hoisted(() => ({
  saveActionItems: vi.fn(async (_meetingId: string, items: unknown[]) => items),
}))

vi.mock('@/services/api', () => ({
  api: {
    saveActionItems,
  },
}))

describe('ActionItemsPanel', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    saveActionItems.mockReset()
    saveActionItems.mockImplementation(async (_meetingId: string, items: unknown[]) => items)
  })

  it('persists done changes to the backend', async () => {
    const user = userEvent.setup()

    render(
      <ActionItemsPanel
        meeting={
          {
            id: 'm1',
            title: '季度复盘',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: {
              status: 'completed',
              content: '## 待办',
            },
            action_items: [
              {
                id: 'a1',
                task: '跟进报价',
                owner: 'Alice',
                due: '2026-04-05',
                done: false,
                position: 0,
              },
            ],
          } as never
        }
      />,
    )

    await user.click(screen.getByText('跟进报价'))

    await waitFor(() =>
      expect(saveActionItems).toHaveBeenCalledWith(
        'm1',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'a1',
            done: true,
          }),
        ]),
      ),
    )

    expect(screen.getByText('跟进报价')).toHaveClass('line-through')
  })

  it('parses summary action items and saves them', async () => {
    const user = userEvent.setup()
    const { getByRole } = render(
      <ActionItemsPanel
        meeting={
          {
            id: 'm2',
            title: '周会',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: {
              status: 'completed',
              content: [
                '## 待办',
                '',
                '| 任务 | 负责人 | 截止 |',
                '| --- | --- | --- |',
                '| 跟进报价 | Alice | 4月5日 |',
              ].join('\n'),
            },
            action_items: [],
          } as never
        }
      />,
    )
    await user.click(getByRole('button', { name: '提取待办' }))

    await waitFor(() =>
      expect(saveActionItems).toHaveBeenCalledWith(
        'm2',
        expect.arrayContaining([
          expect.objectContaining({
            task: '跟进报价',
            owner: 'Alice',
            due: '4月5日',
            done: false,
          }),
        ]),
      ),
    )

    expect(screen.getByText('跟进报价')).toBeInTheDocument()
  })

  it('parses list-style summary action items after template regeneration', async () => {
    const user = userEvent.setup()

    render(
      <ActionItemsPanel
        meeting={
          {
            id: 'm-list',
            title: '模板切换后纪要',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: {
              status: 'completed',
              content: [
                '## 会议摘要',
                '',
                '## 待办事项',
                '',
                '- 跟进客户报价，负责人：Alice，截止时间：4月25日',
                '- 安排下周复盘，负责人：Bob，截止日期：4月28日',
              ].join('\n'),
            },
            action_items: [],
          } as never
        }
      />,
    )

    await user.click(screen.getByRole('button', { name: '提取待办' }))

    await waitFor(() =>
      expect(saveActionItems).toHaveBeenCalledWith(
        'm-list',
        expect.arrayContaining([
          expect.objectContaining({
            task: '跟进客户报价',
            owner: 'Alice',
            due: '4月25日',
            done: false,
          }),
          expect.objectContaining({
            task: '安排下周复盘',
            owner: 'Bob',
            due: '4月28日',
            done: false,
          }),
        ]),
      ),
    )
  })

  it('parses decision-style summary tables after template regeneration', async () => {
    const user = userEvent.setup()

    render(
      <ActionItemsPanel
        meeting={
          {
            id: 'm-decision',
            title: '决策模板纪要',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: {
              status: 'completed',
              content: [
                '## 核心决策',
                '',
                '确定本周内推进客户回访。',
                '',
                '## 后续执行',
                '',
                '| 决策事项 | 执行人 | 执行期限 | 验收标准 |',
                '| --- | --- | --- | --- |',
                '| 跟进重点客户回访 | Alice | 4月25日 | 完成回访纪要 |',
                '| 输出报价修订方案 | Bob | 4月28日 | 提交修订版报价单 |',
              ].join('\n'),
            },
            action_items: [],
          } as never
        }
      />,
    )

    await user.click(screen.getByRole('button', { name: '提取待办' }))

    await waitFor(() =>
      expect(saveActionItems).toHaveBeenCalledWith(
        'm-decision',
        expect.arrayContaining([
          expect.objectContaining({
            task: '跟进重点客户回访',
            owner: 'Alice',
            due: '4月25日',
            done: false,
          }),
          expect.objectContaining({
            task: '输出报价修订方案',
            owner: 'Bob',
            due: '4月28日',
            done: false,
          }),
        ]),
      ),
    )
  })

  it('parses natural-language action sentences in summaries', async () => {
    const user = userEvent.setup()

    render(
      <ActionItemsPanel
        meeting={
          {
            id: 'm-prose',
            title: '自然语言纪要',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: {
              status: 'completed',
              content: [
                '## 会议结论',
                '',
                '确定本周内推进客户回访和报价修订。',
                '',
                '## 后续跟进',
                '',
                '后续由Alice负责跟进客户报价，截止时间4月25日。',
                '请Bob于4月28日前安排下周复盘。',
                'Carol负责输出修订方案，截止日期4月30日。',
              ].join('\n'),
            },
            action_items: [],
          } as never
        }
      />,
    )

    await user.click(screen.getByRole('button', { name: '提取待办' }))

    await waitFor(() =>
      expect(saveActionItems).toHaveBeenCalledWith(
        'm-prose',
        expect.arrayContaining([
          expect.objectContaining({
            task: '跟进客户报价',
            owner: 'Alice',
            due: '4月25日',
            done: false,
          }),
          expect.objectContaining({
            task: '安排下周复盘',
            owner: 'Bob',
            due: '4月28日前',
            done: false,
          }),
          expect.objectContaining({
            task: '输出修订方案',
            owner: 'Carol',
            due: '4月30日',
            done: false,
          }),
        ]),
      ),
    )
  })

  it('wraps long action item copy instead of letting it overflow the card', () => {
    render(
      <ActionItemsPanel
        meeting={
          {
            id: 'm3',
            title: '长任务文本',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: {
              status: 'completed',
              content: '## 待办',
            },
            action_items: [
              {
                id: 'a-long',
                task: '这是一个非常长的待办事项文本，需要在卡片里正常换行显示而不是把布局撑坏',
                owner: 'Alice',
                due: '2026-04-05',
                done: false,
                position: 0,
              },
            ],
          } as never
        }
      />,
    )

    expect(screen.getByTestId('action-item-task-a-long')).toHaveClass('break-words')
  })

  it('makes the action item list independently scrollable on desktop', () => {
    render(
      <ActionItemsPanel
        meeting={
          {
            id: 'm4',
            title: '待办滚动',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            transcripts: [],
            summary: {
              status: 'completed',
              content: '## 待办',
            },
            action_items: Array.from({ length: 8 }, (_, index) => ({
              id: `a-${index}`,
              task: `待办事项 ${index + 1}`,
              owner: 'Alice',
              due: '2026-04-05',
              done: false,
              position: index,
            })),
          } as never
        }
      />,
    )

    const scrollArea = screen.getByTestId('action-items-scroll')
    expect(scrollArea.className).toContain('meeting-action-items-scroll')
    expect(screen.getByText('待办清单').closest('div')?.parentElement?.className).toContain('meeting-action-items-panel')
  })
})
