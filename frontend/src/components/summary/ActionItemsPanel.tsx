import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle2, Circle } from "lucide-react"
import { api } from "@/services/api"
import type { ActionItem, MeetingDetail } from "@/types"

interface Props {
  meeting: MeetingDetail
}

function parseActionItems(content: string): ActionItem[] {
  const tableItems = parseTableActionItems(content)
  if (tableItems.length > 0) {
    return tableItems
  }
  const listItems = parseListActionItems(content)
  if (listItems.length > 0) {
    return listItems
  }
  return parseSentenceActionItems(content)
}

function parseTableActionItems(content: string): ActionItem[] {
  const items: ActionItem[] = []
  const lines = content.split("\n")
  let inTable = false

  for (const line of lines) {
    if (
      line.includes("| 任务")
      || line.includes("| 负责人")
      || line.includes("| 决策事项")
      || line.includes("| 执行人")
      || line.includes("| 执行期限")
    ) {
      inTable = true
      continue
    }
    if (inTable && line.startsWith("|") && !line.includes("---")) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean)
      if (
        cells.length >= 3
        && cells[0]
        && !["任务", "负责人", "截止日期", "决策事项", "执行人", "执行期限", "验收标准", "..."].includes(cells[0])
      ) {
        items.push({
          id: crypto.randomUUID(),
          task: cells[0],
          owner: cells[1] || "—",
          due: cells[2] || "—",
          done: false,
        })
      }
    } else if (inTable && !line.startsWith("|")) {
      inTable = false
    }
  }
  return items
}

function extractField(source: string, pattern: RegExp) {
  return source.match(pattern)?.[1]?.trim()
}

function cleanupTaskText(source: string) {
  return source
    .replace(/^[-*+]\s*(\[[ xX]\]\s*)?/, "")
    .replace(/^[0-9]+\.\s+/, "")
    .replace(/[（(]\s*负责人[:：][^)）]+[)）]/g, "")
    .replace(/[（(]\s*截止(?:时间|日期)?[:：][^)）]+[)）]/g, "")
    .replace(/负责人[:：][^，。；;]+/g, "")
    .replace(/截止(?:时间|日期)?[:：][^，。；;]+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[；;，,、:\-—\s]+$/g, "")
    .trim()
}

function parseListActionItems(content: string): ActionItem[] {
  const items: ActionItem[] = []
  const lines = content.split("\n")
  let inActionSection = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (/^#{1,6}\s*(待办事项|待办清单|行动项|行动事项|后续行动|后续跟进|跟进事项|下一步)/.test(line)) {
      inActionSection = true
      continue
    }

    if (inActionSection && /^#{1,6}\s+/.test(line)) {
      break
    }

    if (!inActionSection) {
      continue
    }

    if (!/^([-*+]\s+|\d+\.\s+)/.test(line)) {
      continue
    }

    const owner = extractField(line, /负责人[:：]\s*([^，。；;）)]+)/)
    const due = extractField(line, /截止(?:时间|日期)?[:：]\s*([^，。；;）)]+)/)
    const task = cleanupTaskText(line)

    if (!task) {
      continue
    }

    items.push({
      id: crypto.randomUUID(),
      task,
      owner: owner || "—",
      due: due || "—",
      done: false,
    })
  }

  return items
}

function collectActionSectionLines(content: string) {
  const lines = content.split("\n")
  const sectionLines: string[] = []
  let inActionSection = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (/^#{1,6}\s*(待办事项|待办清单|行动项|行动事项|后续行动|后续跟进|跟进事项|下一步|后续执行)/.test(line)) {
      inActionSection = true
      continue
    }

    if (inActionSection && /^#{1,6}\s+/.test(line)) {
      break
    }

    if (inActionSection) {
      sectionLines.push(line)
    }
  }

  return sectionLines
}

function extractSentenceDue(source: string) {
  const keywordDue = extractField(source, /截止(?:时间|日期)?[:：]?\s*([^，。；;]+)/)
  if (keywordDue) return keywordDue
  return extractField(source, /(?:于|在)\s*([^，。；;]{1,20}?前)/)
}

function extractSentenceOwner(source: string) {
  return (
    extractField(source, /由\s*([A-Za-z\u4e00-\u9fa5][A-Za-z0-9_\-\u4e00-\u9fa5]{0,19}?)(?=负责|于|在|，|。|；|;)/) ||
    extractField(source, /请\s*([A-Za-z\u4e00-\u9fa5][A-Za-z0-9_\-\u4e00-\u9fa5]{0,19}?)(?=负责|于|在|，|。|；|;)/) ||
    extractField(source, /([A-Za-z\u4e00-\u9fa5][A-Za-z0-9_\-\u4e00-\u9fa5]{0,19}?)负责/)
  )
}

function cleanupSentenceTask(source: string) {
  return source
    .replace(/^(后续|需要|请继续)?\s*/, "")
    .replace(/^由\s*[A-Za-z\u4e00-\u9fa5][A-Za-z0-9_\-\u4e00-\u9fa5]{0,19}?(?=负责|于|在|，|。|；|;)\s*/, "")
    .replace(/^请\s*[A-Za-z\u4e00-\u9fa5][A-Za-z0-9_\-\u4e00-\u9fa5]{0,19}?(?=负责|于|在|，|。|；|;)\s*/, "")
    .replace(/^[A-Za-z\u4e00-\u9fa5][A-Za-z0-9_\-\u4e00-\u9fa5]{0,19}\s*负责/, "")
    .replace(/(?:于|在)\s*[^，。；;]{1,20}?前/g, "")
    .replace(/截止(?:时间|日期)?[:：]?\s*[^，。；;]+/g, "")
    .replace(/负责/g, "")
    .replace(/^[，。；;、\s]+/, "")
    .replace(/[，。；;、\s]+$/g, "")
    .trim()
}

function parseSentenceActionItems(content: string): ActionItem[] {
  const items: ActionItem[] = []
  const sectionLines = collectActionSectionLines(content)

  for (const line of sectionLines) {
    if (/^\|/.test(line) || /^([-*+]\s+|\d+\.\s+)/.test(line)) {
      continue
    }

    const owner = extractSentenceOwner(line)
    const due = extractSentenceDue(line)
    const task = cleanupSentenceTask(line)

    if (!owner || !task) {
      continue
    }

    items.push({
      id: crypto.randomUUID(),
      task,
      owner,
      due: due || "—",
      done: false,
    })
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

export default function ActionItemsPanel({ meeting }: Props) {
  const summary = meeting.summary
  const [items, setItems] = useState<ActionItem[]>(() => {
    return normalizeItems(meeting.action_items ?? [])
  })
  const [parsed, setParsed] = useState((meeting.action_items?.length ?? 0) > 0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const nextItems = normalizeItems(meeting.action_items ?? [])
    setItems(nextItems)
    setParsed(nextItems.length > 0)
  }, [meeting.action_items, meeting.id])

  const persistItems = async (nextItems: ActionItem[]) => {
    const normalized = normalizeItems(nextItems)
    setSaving(true)
    try {
      const saved = await api.saveActionItems(meeting.id, normalized)
      const next = normalizeItems(saved)
      setItems(next)
      setParsed(next.length > 0)
    } finally {
      setSaving(false)
    }
  }

  const handleParse = async () => {
    setLoading(true)
    try {
      if (summary?.content) {
        await persistItems(parseActionItems(summary.content))
      } else {
        setParsed(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const toggleDone = (idx: number) => {
    const nextItems = items.map((item, i) => (i === idx ? { ...item, done: !item.done } : item))
    setItems(nextItems)
    void persistItems(nextItems)
  }

  if (!summary || summary.status !== "completed") {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        生成会议摘要后可提取待办
      </div>
    )
  }

  return (
    <div className="meeting-action-items-panel flex flex-col p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">待办清单</span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs"
          onClick={() => void handleParse()}
          disabled={loading || saving}
        >
          {loading || saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "提取待办"}
        </Button>
      </div>

      {items.length > 0 ? (
        <div
          data-testid="action-items-scroll"
          className="meeting-action-items-scroll flex-1 min-h-0 space-y-2"
        >
          {items.map((item, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 p-2.5 rounded-lg border border-white/50 cursor-pointer transition-colors ${item.done ? "bg-emerald-50/30 opacity-50" : "bg-white/50 backdrop-blur-sm hover:bg-emerald-50/40"}`}
              onClick={() => toggleDone(i)}
            >
              <div className="mt-0.5 flex-shrink-0 text-muted-foreground">
                {item.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  data-testid={`action-item-task-${item.id}`}
                  className={`break-words text-xs font-medium leading-snug ${item.done ? "line-through text-muted-foreground" : ""}`}
                >
                  {item.task}
                </p>
                <p className="mt-0.5 break-words text-xs text-muted-foreground">
                  {item.owner !== "—" && <span>{item.owner}</span>}
                  {item.owner !== "—" && item.due !== "—" && <span className="mx-1">·</span>}
                  {item.due !== "—" && <span>{item.due}</span>}
                </p>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground text-right">
            {items.filter((i) => i.done).length}/{items.length} 已完成
          </p>
        </div>
      ) : parsed ? (
        <p className="text-xs text-muted-foreground">摘要中未发现明确待办</p>
      ) : null}
    </div>
  )
}
