import type { MeetingChapter } from '@/types'

interface Props {
  chapters: MeetingChapter[]
  loading?: boolean
  error?: string
  activeChapterId?: string | null
  regenerating?: boolean
  onSelect: (chapter: MeetingChapter) => void
  onRegenerate?: () => void
}

function formatSeconds(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function formatTimestamp(value: string): string {
  const numeric = Number(value)
  if (value.trim() !== '' && Number.isFinite(numeric)) {
    return formatSeconds(numeric)
  }
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }
  return value
}

export default function ChapterNavigation({ chapters, loading, error, activeChapterId, regenerating, onSelect, onRegenerate }: Props) {
  return (
    <div className="border-b border-white/40 bg-emerald-50/30 backdrop-blur px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-primary/80">章节速览</p>
          <h3 className="text-xs font-semibold leading-5">时间导航</h3>
        </div>
        <div className="flex items-center gap-2">
          {loading && <span className="text-[11px] text-muted-foreground">生成中...</span>}
          {onRegenerate && !loading && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating}
              className="text-[11px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
              title="重新生成章节"
            >
              {regenerating ? '重新生成中...' : '重新生成'}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className="mt-1.5 text-[11px] text-red-500">{error}</p>
      ) : chapters.length ? (
        <div className="mt-2.5 space-y-1.5">
          {chapters.map((chapter, index) => {
            const isActive = chapter.id === activeChapterId
            return (
              <button
                key={chapter.id}
                type="button"
                onClick={() => onSelect(chapter)}
                className={`w-full rounded-lg border px-3 py-1.5 text-left transition-colors ${
                  isActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background hover:border-foreground/20 hover:bg-muted/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 break-words text-xs font-medium leading-5">
                    {index + 1}. {chapter.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatTimestamp(chapter.start_timestamp)}
                  </span>
                </div>
                {chapter.summary && (
                  <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                    {chapter.summary}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {loading ? '正在生成章节...' : '暂无章节'}
        </p>
      )}
    </div>
  )
}
