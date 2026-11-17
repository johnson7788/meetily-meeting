import { useState, useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Check, ChevronDown, ChevronUp, Copy, Loader2 } from "lucide-react"
import { api } from "@/services/api"
import type { MeetingDetail, Template } from "@/types"

interface Props {
  meeting: MeetingDetail
  onRefresh: () => void
}

type SummaryTemplateKey = "__default__" | "decision" | "brainstorm" | "interview" | `custom:${string}`

type SummaryTemplatePreset = {
  key: Exclude<SummaryTemplateKey, `custom:${string}`>
  name: string
  summary: string
  buttonLabel: string
  templateName?: string
}

const SUMMARY_TEMPLATE_PRESETS: SummaryTemplatePreset[] = [
  {
    key: "__default__",
    name: "默认模板",
    summary: "适合通用会议，覆盖概要、讨论点、决策与待跟进。",
    buttonLabel: "生成默认会议纪要",
  },
  {
    key: "decision",
    name: "决策型",
    summary: "适合评审、定案和复盘，突出核心决策与执行安排。",
    buttonLabel: "生成决策型纪要",
    templateName: "决策型会议",
  },
  {
    key: "brainstorm",
    name: "脑暴型",
    summary: "适合脑暴和头脑风暴，保留创意点和待深化方向。",
    buttonLabel: "生成脑暴型纪要",
    templateName: "创意脑暴",
  },
  {
    key: "interview",
    name: "访谈型",
    summary: "适合访谈和调研，突出观点、引述和后续跟进。",
    buttonLabel: "生成访谈型纪要",
    templateName: "访谈记录",
  },
]

export default function SummaryPanel({ meeting, onRefresh }: Props) {
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<SummaryTemplateKey>("__default__")
  const [templates, setTemplates] = useState<Template[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState("")
  const [templatesExpanded, setTemplatesExpanded] = useState(false)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const copyTimerRef = useRef<number | null>(null)

  const summary = meeting.summary

  useEffect(() => {
    api.getTemplates().then(setTemplates).catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setCopyState("idle")
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = null
    }
  }, [summary?.content])

  const customTemplates = templates.filter((template) => !SUMMARY_TEMPLATE_PRESETS.some((preset) => preset.templateName === template.name))
  const selectedPreset = SUMMARY_TEMPLATE_PRESETS.find((preset) => preset.key === selectedTemplateKey)
  const selectedCustomTemplate = selectedTemplateKey.startsWith("custom:")
    ? templates.find((template) => template.id === selectedTemplateKey.slice("custom:".length))
    : undefined
  const selectedTemplateName = selectedPreset?.name ?? selectedCustomTemplate?.name ?? "默认模板"
  const selectedTemplateSummary = selectedPreset?.summary
    ?? (selectedCustomTemplate ? "使用自定义模板生成会议摘要，内容来自设置页配置。" : "适合通用会议，覆盖概要、讨论点、决策与待跟进。")
  const generateButtonLabel = selectedPreset?.buttonLabel ?? (selectedCustomTemplate ? `生成${selectedCustomTemplate.name}摘要` : "生成默认会议纪要")
  const templateLocked = generating || summary?.status === "pending"

  const getTemplateId = () => {
    if (selectedTemplateKey === "__default__") {
      return undefined
    }
    if (selectedTemplateKey.startsWith("custom:")) {
      return selectedTemplateKey.slice("custom:".length)
    }
    const preset = SUMMARY_TEMPLATE_PRESETS.find((item) => item.key === selectedTemplateKey)
    if (!preset?.templateName) {
      return undefined
    }
    return templates.find((template) => template.name === preset.templateName)?.id
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError("")

    try {
      const tid = getTemplateId()
      await api.summarize(meeting.id, tid)

      // 轮询直到摘要完成（最长 2 分钟）
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const updated = await api.getMeeting(meeting.id)
        const s = updated.summary?.status
        if (s === "completed" || s === "failed") {
          onRefresh()
          break
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败")
    } finally {
      setGenerating(false)
    }
  }

  const copySummary = async (content: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content)
      return
    }

    const textarea = document.createElement("textarea")
    textarea.value = content
    textarea.setAttribute("readonly", "true")
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand("copy")
    document.body.removeChild(textarea)

    if (!copied) {
      throw new Error("复制失败")
    }
  }

  const handleCopySummary = async () => {
    if (!summary?.content) {
      return
    }

    try {
      await copySummary(summary.content)
      setCopyState("copied")
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = window.setTimeout(() => setCopyState("idle"), 1800)
    } catch {
      setCopyState("failed")
    }
  }

  return (
    <div className="flex flex-col xl:min-h-0 xl:h-full">
      <div className="flex-shrink-0 border-b border-white/40 bg-white/20 backdrop-blur-sm p-4 space-y-4">
        <div className="space-y-0.5">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-emerald-600">会议资产</p>
          <h2 className="text-sm font-semibold tracking-tight">会议摘要</h2>
        </div>

        <div className="rounded-2xl border border-emerald-100/60 bg-white/60 backdrop-blur p-3 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium text-foreground">当前模板</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {selectedTemplateName}
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{selectedTemplateSummary}</p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-full shrink-0 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setTemplatesExpanded((value) => !value)}
              disabled={templateLocked}
            >
              {templatesExpanded ? (
                <>
                  <ChevronUp className="mr-1 h-3.5 w-3.5" />
                  收起模板
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 h-3.5 w-3.5" />
                  展开模板
                </>
              )}
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2">
            {customTemplates.length > 0 && (
              <Select
                value={selectedTemplateKey.startsWith("custom:") ? selectedTemplateKey : ""}
                onValueChange={(value) => setSelectedTemplateKey(`custom:${value}`)}
                disabled={templateLocked}
              >
                <SelectTrigger className="h-10 w-full text-xs">
                  <SelectValue placeholder="选择自定义模板" />
                </SelectTrigger>
                <SelectContent>
                  {customTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              className="h-10 w-full px-4 text-xs"
              onClick={() => void handleGenerate()}
              disabled={templateLocked}
            >
              {generating ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  生成中...
                </>
              ) : (
                generateButtonLabel
              )}
            </Button>
          </div>

          {templatesExpanded && (
            <div
              data-testid="summary-templates-scroll"
              className="summary-templates-scroll mt-3 grid gap-2"
            >
              {SUMMARY_TEMPLATE_PRESETS.map((preset) => {
                const active = selectedTemplateKey === preset.key
                return (
                  <Button
                    key={preset.key}
                    type="button"
                    variant={active ? "default" : "outline"}
                    className="h-auto items-start justify-start rounded-2xl px-3 py-3 text-left"
                    aria-label={preset.name}
                    onClick={() => setSelectedTemplateKey(preset.key)}
                    disabled={templateLocked}
                  >
                    <div className="flex w-full items-start gap-2">
                      <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${active ? "border-primary-foreground/30 bg-primary-foreground text-primary" : "border-border bg-background text-muted-foreground"}`}>
                        {active ? <Check className="h-3 w-3" /> : "•"}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-sm font-medium">{preset.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? "bg-primary-foreground/15 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            {preset.buttonLabel}
                          </span>
                        </div>
                        <p className={`text-xs leading-5 ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{preset.summary}</p>
                      </div>
                    </div>
                  </Button>
                )
              })}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <div
        data-testid="summary-panel-content"
        className="min-h-0 p-4 text-sm xl:flex-1 xl:overflow-y-auto xl:overscroll-contain"
      >
        {!summary && !generating && (
          <p className="text-xs text-muted-foreground">点击上方按钮生成会议摘要，沉淀为可复用的会议资产。</p>
        )}
        {summary?.status === "pending" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> 生成中，请稍候...
          </div>
        )}
        {summary?.status === "completed" && summary.content && (
          <div className="space-y-3 rounded-2xl border border-emerald-100/60 bg-emerald-50/40 p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">生成结果</p>
                {copyState === "copied" && <p className="mt-1 text-[11px] text-emerald-600">已复制到剪贴板</p>}
                {copyState === "failed" && <p className="mt-1 text-[11px] text-red-500">复制失败</p>}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 rounded-full px-3 text-xs"
                onClick={() => void handleCopySummary()}
              >
                {copyState === "copied" ? (
                  <>
                    <Check className="mr-1 h-3.5 w-3.5" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    复制纪要
                  </>
                )}
              </Button>
            </div>

            <div data-testid="summary-result-scroll">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="mb-1.5 mt-4 text-base font-semibold first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="mb-1.5 mt-4 border-b pb-1 text-sm font-semibold first:mt-0">{children}</h2>,
                  h3: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-medium">{children}</h3>,
                  p: ({ children }) => <p className="mb-2 break-words text-sm leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="mb-2 list-inside list-disc space-y-0.5 text-sm">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-2 list-inside list-decimal space-y-0.5 text-sm">{children}</ol>,
                  li: ({ children }) => <li className="break-words text-sm leading-relaxed">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  hr: () => <hr className="my-3 border-border" />,
                  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground">{children}</blockquote>,
                  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>,
                  table: ({ children }) => <div className="mb-2 overflow-x-auto"><table className="w-full border-collapse text-xs">{children}</table></div>,
                  th: ({ children }) => <th className="border border-border bg-muted px-2 py-1 text-left font-medium">{children}</th>,
                  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
                }}
              >
                {summary.content}
              </ReactMarkdown>
            </div>
          </div>
        )}
        {summary?.status === "failed" && (
          <p className="text-xs text-red-500">生成失败：{summary.error}</p>
        )}
      </div>
    </div>
  )
}
