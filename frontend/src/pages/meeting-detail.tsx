import { useEffect, useRef, useState } from "react"
import { useParams, Link } from "@tanstack/react-router"
import { useMeetingStore } from "@/store/meetingStore"
import { api } from "@/services/api"
import ChapterNavigation from "@/components/transcript/ChapterNavigation"
import TranscriptList from "@/components/transcript/TranscriptList"
import ChatPanel from "@/components/summary/ChatPanel"
import { Button } from "@/components/ui/button"
import type { MeetingChapter } from "@/types"
import { ChevronLeft, Download } from "lucide-react"

function formatExportDate(createdAt: string) {
  const datePart = new Date(createdAt).toISOString().slice(0, 10)
  return datePart
}

function buildExportFileName(meetingId: string, createdAt: string) {
  return `会议-${formatExportDate(createdAt)}-${meetingId}.md`
}

function escapeMarkdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ")
}

function buildExportMarkdown(
  title: string,
  actionItems: Array<{
    task: string
    owner?: string | null
    due?: string | null
    done?: boolean
  }>,
  summaryContent?: string | null,
) {
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push("")
  if (summaryContent?.trim()) {
    lines.push(summaryContent.trim())
  } else {
    lines.push("当前会议尚未生成摘要。")
  }

  if (actionItems.length > 0) {
    lines.push("")
    lines.push("## 待办事项")
    lines.push("")
    lines.push("| 状态 | 任务 | 负责人 | 截止日期 |")
    lines.push("| --- | --- | --- | --- |")
    actionItems.forEach((item) => {
      lines.push(
        `| ${item.done ? "已完成" : "待处理"} | ${escapeMarkdownCell(item.task)} | ${escapeMarkdownCell(item.owner || "未指定")} | ${escapeMarkdownCell(item.due || "未填写")} |`,
      )
    })
  }

  return lines.join("\n")
}

export default function MeetingDetailPage() {
  const { meetingId } = useParams({ from: "/meetings/$meetingId" })
  const meeting = useMeetingStore((s) => s.currentMeeting)
  const loading = useMeetingStore((s) => s.loading)
  const fetchMeeting = useMeetingStore((s) => s.fetchMeeting)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const [displayTitle, setDisplayTitle] = useState("")
  const [savingTitle, setSavingTitle] = useState(false)
  const [chapters, setChapters] = useState<MeetingChapter[]>([])
  const [loadingChapters, setLoadingChapters] = useState(false)
  const [chapterError, setChapterError] = useState("")
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [translateToChinese, setTranslateToChinese] = useState(() => localStorage.getItem("meeting_detail_translate_to_zh") === "true")
  const [translationLoading, setTranslationLoading] = useState(false)
  const [translationError, setTranslationError] = useState("")
  const translationAttemptedRef = useRef<string | null>(null)

  useEffect(() => {
    void fetchMeeting(meetingId)
  }, [meetingId, fetchMeeting])

  useEffect(() => {
    if (meeting?.chapters && meeting.chapters.length > 0) {
      setChapters(meeting.chapters)
      setActiveChapterId((prev) => prev ?? meeting.chapters[0]?.id ?? null)
      setLoadingChapters(false)
      return
    }
    let cancelled = false
    setLoadingChapters(true)
    setChapterError("")
    void api.extractChapters(meetingId)
      .then((result) => {
        if (cancelled) return
        setChapters(result.chapters)
        setActiveChapterId(result.chapters[0]?.id ?? null)
      })
      .catch((error) => {
        if (cancelled) return
        setChapters([])
        setChapterError(error instanceof Error ? error.message : "章节提取失败")
      })
      .finally(() => {
        if (!cancelled) setLoadingChapters(false)
      })

    return () => {
      cancelled = true
    }
  }, [meetingId, meeting?.chapters])

  useEffect(() => {
    if (!meeting) return
    setDisplayTitle(meeting.title)
    if (!isEditingTitle) setDraftTitle(meeting.title)
  }, [meeting, isEditingTitle])

  useEffect(() => {
    localStorage.setItem("meeting_detail_translate_to_zh", String(translateToChinese))
  }, [translateToChinese])

  useEffect(() => {
    if (!meeting) return
    if (!translateToChinese) {
      translationAttemptedRef.current = null
      setTranslationLoading(false)
      setTranslationError("")
      return
    }

    const needsTranslation = meeting.transcripts.some((segment) => !segment.translated_text?.trim())
    if (!needsTranslation || translationAttemptedRef.current === meeting.id) return

    translationAttemptedRef.current = meeting.id
    let cancelled = false
    setTranslationLoading(true)
    setTranslationError("")

    void api.translateMeeting(meeting.id)
      .then(async () => {
        if (cancelled) return
        await fetchMeeting(meeting.id)
      })
      .catch((error) => {
        if (cancelled) return
        setTranslationError(error instanceof Error ? error.message : "翻译失败")
      })
      .finally(() => {
        if (!cancelled) setTranslationLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [meeting, translateToChinese, fetchMeeting])

  if (loading && !meeting) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        加载中...
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        记录不存在
      </div>
    )
  }

  const refresh = () => void fetchMeeting(meetingId)
  const displaySegments = translateToChinese
    ? meeting.transcripts
    : meeting.transcripts.map((segment) => ({ ...segment, translated_text: undefined }))

  const jumpToChapter = (chapter: MeetingChapter) => {
    setActiveChapterId(chapter.id)
    const target = document.getElementById(chapter.start_segment_id)
    target?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const handleRegenerateChapters = async () => {
    if (regenerating) return
    setRegenerating(true)
    setChapterError("")
    try {
      const result = await api.regenerateChapters(meetingId)
      setChapters(result.chapters)
      setActiveChapterId(result.chapters[0]?.id ?? null)
      await fetchMeeting(meetingId)
    } catch (error) {
      setChapterError(error instanceof Error ? error.message : "章节重新生成失败")
    } finally {
      setRegenerating(false)
    }
  }

  const handleRenameSpeaker = async (source: string, label: string) => {
    await api.updateSpeakerLabel(meeting.id, source, label)
    await fetchMeeting(meeting.id)
  }

  const startEditingTitle = () => {
    setDraftTitle(displayTitle)
    setIsEditingTitle(true)
  }

  const cancelEditingTitle = () => {
    setDraftTitle(displayTitle)
    setIsEditingTitle(false)
  }

  const submitTitle = async () => {
    if (savingTitle) return
    const nextTitle = draftTitle.trim()
    if (!nextTitle || nextTitle === displayTitle) {
      cancelEditingTitle()
      return
    }
    setSavingTitle(true)
    try {
      await api.updateTitle(meeting.id, nextTitle)
      setDisplayTitle(nextTitle)
      setDraftTitle(nextTitle)
      setIsEditingTitle(false)
      await fetchMeeting(meeting.id)
    } finally {
      setSavingTitle(false)
    }
  }

  const handleExport = () => {
    const markdown = buildExportMarkdown(
      displayTitle,
      meeting.action_items ?? [],
      meeting.summary?.status === "completed" ? meeting.summary.content : null,
    )
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = buildExportFileName(meeting.id, meeting.created_at)
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div data-testid="meeting-detail-layout" className="min-h-full select-text">
      <div
        data-testid="meeting-detail-content"
        className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 select-text xl:grid xl:grid-cols-[minmax(0,2fr)_auto_3fr] xl:items-start"
      >
        {/* Transcript Section */}
        <section className="min-w-0 overflow-y-auto rounded-3xl border border-white/60 bg-white/40 backdrop-blur-xl shadow-sm select-text xl:max-h-[calc(100vh-60px)] xl:sticky xl:top-5">
          <div className="border-b border-white/40 px-5 py-4 space-y-2">
            <div className="flex items-center gap-2">
              <Link
                to="/meetings"
                className="flex items-center gap-0.5 text-xs text-slate-500 hover:text-emerald-600 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                会议资产
              </Link>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant={translateToChinese ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setTranslationError("")
                    setTranslateToChinese((value) => !value)
                  }}
                  className="h-8 rounded-full px-3 text-xs"
                >
                  {translationLoading ? "翻译中..." : translateToChinese ? "英转中：开" : "英转中：关"}
                </Button>
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-600 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  导出 MD
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-emerald-600">会议资产详情</p>
              {isEditingTitle ? (
                <input
                  aria-label="会议标题"
                  value={draftTitle}
                  autoFocus
                  disabled={savingTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={() => void submitTitle()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void submitTitle()
                    }
                    if (e.key === "Escape") {
                      e.preventDefault()
                      cancelEditingTitle()
                    }
                  }}
                  className="w-full rounded-lg border border-emerald-200 bg-white/60 backdrop-blur px-2 py-1 text-sm font-semibold outline-none ring-offset-background focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
                />
              ) : (
                <button
                  data-testid="meeting-detail-title-button"
                  type="button"
                  onClick={startEditingTitle}
                  className="max-w-full whitespace-normal break-words text-left text-sm font-semibold leading-6 hover:text-emerald-600 transition-colors"
                >
                  {displayTitle}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {meeting.transcripts.length} 段转写 · {new Date(meeting.created_at).toLocaleString("zh-CN")} · 可继续生成摘要、待办和导出
            </p>
            {translationError && (
              <p className="text-xs text-red-500">{translationError}</p>
            )}
            {meeting.notes && meeting.notes.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                <p className="text-xs font-semibold text-amber-800 mb-1">用户备注</p>
                <ul className="space-y-1">
                  {meeting.notes.map((n) => (
                    <li key={n.id} className="text-xs text-amber-900">
                      <span className="opacity-60 mr-2">{new Date(n.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                      {n.content}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <ChapterNavigation
              chapters={chapters}
              loading={loadingChapters}
              error={chapterError}
              activeChapterId={activeChapterId}
              regenerating={regenerating}
              onSelect={jumpToChapter}
              onRegenerate={handleRegenerateChapters}
            />
            <div className="min-w-0">
              <TranscriptList
                segments={displaySegments}
                speakerLabels={meeting.speaker_labels ?? []}
                onRenameSpeaker={(source, label) => void handleRenameSpeaker(source, label)}
              />
            </div>
          </div>
        </section>

        {/* Vertical Divider */}
        <div className="hidden xl:block w-px self-stretch bg-slate-200/80"></div>

        {/* Sidebar - Chat Panel */}
        <aside className="meeting-detail-sidebar-shell flex min-w-0 flex-col xl:sticky xl:top-5">
          <div
            data-testid="meeting-detail-sidebar"
            className="overflow-y-auto rounded-3xl border border-white/60 bg-white/40 backdrop-blur-xl shadow-sm select-text h-[calc(100vh-60px)]"
          >
            <ChatPanel meeting={meeting} onRefresh={refresh} />
          </div>
        </aside>
      </div>
    </div>
  )
}
