import { useState, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Circle, Loader2, Send } from "lucide-react"
import { api } from "@/services/api"
import type { ActionItem, MeetingDetail } from "@/types"

interface Props {
  meeting: MeetingDetail
  onRefresh: () => void
}

type MessageRole = "user" | "assistant"

interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  type?: "summary" | "action-items" | "mindmap" | "text"
  actionItems?: ActionItem[]
}

function parseActionItems(content: string): ActionItem[] {
  const items: ActionItem[] = []
  const lines = content.split("\n")
  let inTable = false
  let inActionSection = false

  // Try table parsing first
  for (const line of lines) {
    if (
      line.includes("| 任务") || line.includes("| 负责人") ||
      line.includes("| 决策事项") || line.includes("| 执行人")
    ) {
      inTable = true
      continue
    }
    if (inTable && line.startsWith("|") && !line.includes("---")) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean)
      if (cells.length >= 3 && cells[0] && !["任务", "负责人", "截止日期", "决策事项", "执行人", "执行期限", "验收标准", "..."].includes(cells[0])) {
        items.push({ id: crypto.randomUUID(), task: cells[0], owner: cells[1] || "—", due: cells[2] || "—", done: false })
      }
    } else if (inTable && !line.startsWith("|")) {
      inTable = false
    }
  }
  if (items.length > 0) return items

  // Try list parsing
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (/^#{1,6}\s*(待办事项|待办清单|行动项|行动事项|后续行动|后续跟进|跟进事项|下一步)/.test(line)) {
      inActionSection = true
      continue
    }
    if (inActionSection && /^#{1,6}\s+/.test(line)) break
    if (!inActionSection) continue
    if (!/^([-*+]\s+|\d+\.\s+)/.test(line)) continue

    const owner = line.match(/负责人[:：]\s*([^，。；;）)]+)/)?.[1]?.trim()
    const due = line.match(/截止(?:时间|日期)?[:：]\s*([^，。；;）)]+)/)?.[1]?.trim()
    const task = line
      .replace(/^[-*+]\s*(\[[ xX]\]\s*)?/, "")
      .replace(/^[0-9]+\.\s+/, "")
      .replace(/[（(]\s*负责人[:：][^)）]+[)）]/g, "")
      .replace(/[（(]\s*截止(?:时间|日期)?[:：][^)）]+[)）]/g, "")
      .replace(/负责人[:：][^，。；;]+/g, "")
      .replace(/截止(?:时间|日期)?[:：][^，。；;]+/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/[；;，,、:\-—\s]+$/g, "")
      .trim()

    if (task) {
      items.push({ id: crypto.randomUUID(), task, owner: owner || "—", due: due || "—", done: false })
    }
  }
  return items
}

function normalizeItems(items: ActionItem[]): ActionItem[] {
  return items.map((item, position) => ({
    ...item,
    id: item.id || crypto.randomUUID(),
    owner: item.owner || "—",
    due: item.due || "—",
    done: Boolean(item.done),
    position,
  }))
}

export default function ChatPanel({ meeting, onRefresh }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [generating, setGenerating] = useState(false)
  const [actionItems, setActionItems] = useState<ActionItem[]>(() => normalizeItems(meeting.action_items ?? []))
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setActionItems(normalizeItems(meeting.action_items ?? []))
  }, [meeting.action_items, meeting.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Initialize with existing summary if available
  useEffect(() => {
    const msgs: ChatMessage[] = []
    if (meeting.summary?.status === "completed" && meeting.summary.content) {
      msgs.push({
        id: "init-summary",
        role: "assistant",
        content: meeting.summary.content,
        type: "summary",
      })
    }
    if ((meeting.action_items?.length ?? 0) > 0) {
      msgs.push({
        id: "init-actions",
        role: "assistant",
        content: "已提取待办事项：",
        type: "action-items",
        actionItems: normalizeItems(meeting.action_items ?? []),
      })
    }
    setMessages(msgs)
  }, [meeting.id])

  const addMessage = (msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg])
  }

  const handleGenerateSummary = async () => {
    if (generating) return
    setGenerating(true)
    addMessage({ id: crypto.randomUUID(), role: "user", content: "生成会议纪要", type: "text" })

    try {
      await api.summarize(meeting.id)

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const updated = await api.getMeeting(meeting.id)
        const s = updated.summary?.status
        if (s === "completed" || s === "failed") {
          onRefresh()
          if (s === "completed" && updated.summary?.content) {
            addMessage({ id: crypto.randomUUID(), role: "assistant", content: updated.summary.content, type: "summary" })
          } else {
            addMessage({ id: crypto.randomUUID(), role: "assistant", content: `生成失败：${updated.summary?.error || "未知错误"}`, type: "text" })
          }
          break
        }
      }
    } catch (e) {
      addMessage({ id: crypto.randomUUID(), role: "assistant", content: `生成失败：${e instanceof Error ? e.message : "未知错误"}`, type: "text" })
    } finally {
      setGenerating(false)
    }
  }

  const handleExtractActions = async () => {
    if (generating) return
    const summary = meeting.summary
    if (!summary || summary.status !== "completed" || !summary.content) {
      addMessage({ id: crypto.randomUUID(), role: "assistant", content: "请先生成会议纪要，再提取待办。", type: "text" })
      return
    }

    setGenerating(true)
    addMessage({ id: crypto.randomUUID(), role: "user", content: "提取待办", type: "text" })

    try {
      const parsed = parseActionItems(summary.content)
      const normalized = normalizeItems(parsed)
      const saved = await api.saveActionItems(meeting.id, normalized)
      const result = normalizeItems(saved)
      setActionItems(result)
      addMessage({ id: crypto.randomUUID(), role: "assistant", content: result.length > 0 ? "已提取待办事项：" : "摘要中未发现明确待办", type: "action-items", actionItems: result })
    } catch (e) {
      addMessage({ id: crypto.randomUUID(), role: "assistant", content: `提取失败：${e instanceof Error ? e.message : "未知错误"}`, type: "text" })
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateMindmap = async () => {
    if (generating) return
    const summary = meeting.summary
    if (!summary || summary.status !== "completed" || !summary.content) {
      addMessage({ id: crypto.randomUUID(), role: "assistant", content: "请先生成会议纪要，再生成思维导图。", type: "text" })
      return
    }

    setGenerating(true)
    addMessage({ id: crypto.randomUUID(), role: "user", content: "生成思维导图", type: "text" })

    const prompt = `请根据以下会议纪要，生成一个 Markdown 格式的思维导图。
要求：
1. 使用嵌套的无序列表（- ）表示层级结构。
2. 顶层节点是会议主题，子节点按议题、决策、行动项等分类展开。
3. 只输出 Markdown 列表，不要添加额外解释文字。

会议纪要：
${summary.content}`

    try {
      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      const response = await api.chatWithMeeting(meeting.id, { question: prompt, history })
      addMessage({ id: crypto.randomUUID(), role: "assistant", content: response.answer, type: "mindmap" })
    } catch (e) {
      addMessage({ id: crypto.randomUUID(), role: "assistant", content: `生成失败：${e instanceof Error ? e.message : "未知错误"}`, type: "text" })
    } finally {
      setGenerating(false)
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || generating) return
    setInput("")
    setGenerating(true)
    addMessage({ id: crypto.randomUUID(), role: "user", content: text, type: "text" })
    try {
      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      const response = await api.chatWithMeeting(meeting.id, { question: text, history })
      addMessage({ id: crypto.randomUUID(), role: "assistant", content: response.answer, type: "text" })
    } catch (e) {
      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `对话失败：${e instanceof Error ? e.message : "未知错误"}`,
        type: "text",
      })
    } finally {
      setGenerating(false)
    }
  }

  const toggleDone = (idx: number) => {
    const nextItems = actionItems.map((item, i) => (i === idx ? { ...item, done: !item.done } : item))
    setActionItems(nextItems)
    void api.saveActionItems(meeting.id, normalizeItems(nextItems))
  }

  const renderActionItems = (items: ActionItem[]) => {
    if (!items || items.length === 0) return null
    return (
      <div className="space-y-1.5 mt-2">
        {items.map((item, i) => (
          <div
            key={item.id || i}
            className={`flex items-start gap-2 p-2 rounded-lg border border-white/50 cursor-pointer transition-colors ${item.done ? "bg-emerald-50/30 opacity-50" : "bg-white/50 hover:bg-emerald-50/40"}`}
            onClick={() => toggleDone(i)}
          >
            <div className="mt-0.5 flex-shrink-0 text-muted-foreground">
              {item.done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Circle className="w-3.5 h-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`break-words text-xs font-medium leading-snug ${item.done ? "line-through text-muted-foreground" : ""}`}>{item.task}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {item.owner !== "—" && <span>{item.owner}</span>}
                {item.owner !== "—" && item.due !== "—" && <span className="mx-1">·</span>}
                {item.due !== "—" && <span>{item.due}</span>}
              </p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            使用下方快捷操作开始处理会议内容
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${msg.role === "user" ? "bg-emerald-600 text-white" : "bg-white/60 border border-white/60 backdrop-blur"}`}>
              {msg.type === "summary" || msg.type === "mindmap" ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => <h1 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h1>,
                      h2: ({ children }) => <h2 className="mb-1 mt-3 border-b pb-1 text-xs font-semibold first:mt-0">{children}</h2>,
                      h3: ({ children }) => <h3 className="mb-1 mt-2 text-xs font-medium">{children}</h3>,
                      p: ({ children }) => <p className="mb-1.5 break-words text-xs leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="mb-1.5 list-inside list-disc space-y-0.5 text-xs">{children}</ul>,
                      ol: ({ children }) => <ol className="mb-1.5 list-inside list-decimal space-y-0.5 text-xs">{children}</ol>,
                      li: ({ children }) => <li className="break-words text-xs leading-relaxed">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      table: ({ children }) => <div className="mb-2 overflow-x-auto"><table className="w-full border-collapse text-xs">{children}</table></div>,
                      th: ({ children }) => <th className="border border-border bg-muted px-2 py-1 text-left font-medium text-xs">{children}</th>,
                      td: ({ children }) => <td className="border border-border px-2 py-1 text-xs">{children}</td>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : msg.type === "action-items" ? (
                <div>
                  <p className="text-xs">{msg.content}</p>
                  {renderActionItems(msg.actionItems ?? actionItems)}
                </div>
              ) : (
                <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {generating && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white/60 border border-white/60 backdrop-blur px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions + input */}
      <div className="flex-shrink-0 border-t border-white/40 bg-white/20 backdrop-blur-sm p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-3 text-xs border border-emerald-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all"
            onClick={() => void handleExtractActions()}
            disabled={generating}
          >
            提取待办
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-3 text-xs border border-emerald-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all"
            onClick={() => void handleGenerateSummary()}
            disabled={generating}
          >
            生成会议纪要
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-3 text-xs border border-emerald-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all"
            onClick={() => void handleGenerateMindmap()}
            disabled={generating}
          >
            生成思维导图
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend() }}
            placeholder="输入消息..."
            className="flex-1 h-9 rounded-full border border-emerald-200/60 bg-white/60 backdrop-blur px-4 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
            disabled={generating}
          />
          <Button
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={handleSend}
            disabled={generating || !input.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
