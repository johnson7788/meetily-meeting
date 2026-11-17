import type { SpeakerLabel, TranscriptSegment } from '@/types'
import TranscriptItem from './TranscriptItem'

const SPEAKER_COLORS = [
  '#2563eb', '#16a34a', '#ea580c', '#7c3aed',
  '#db2777', '#0891b2', '#ca8a04', '#dc2626',
]

function buildSpeakers(segments: TranscriptSegment[]) {
  const map: Record<string, { color: string; label: string }> = {}
  segments.forEach((seg) => {
    if (seg.source && !map[seg.source]) {
      const match = seg.source.match(/(\d+)$/)
      const idx = match ? parseInt(match[1], 10) : Object.keys(map).length
      map[seg.source] = {
        color: SPEAKER_COLORS[idx % SPEAKER_COLORS.length],
        label: `说话人${idx + 1}`,
      }
    }
  })
  return map
}

function buildSpeakerOrder(segments: TranscriptSegment[]) {
  const ordered: string[] = []
  const seen = new Set<string>()
  segments.forEach((seg) => {
    if (seg.source && !seen.has(seg.source) && seg.source !== 'upload') {
      seen.add(seg.source)
      ordered.push(seg.source)
    }
  })
  return ordered
}

function buildSpeakerLabelMap(speakerLabels: SpeakerLabel[]) {
  return speakerLabels.reduce<Record<string, string>>((acc, item) => {
    acc[item.source] = item.label
    return acc
  }, {})
}

interface Props {
  segments: TranscriptSegment[]
  speakerLabels: SpeakerLabel[]
  onRenameSpeaker?: (source: string, label: string) => Promise<void> | void
}

export default function TranscriptList({ segments, speakerLabels, onRenameSpeaker }: Props) {
  const fallbackSpeakers = buildSpeakers(segments)
  const speakerLabelMap = buildSpeakerLabelMap(speakerLabels)
  const speakerOrder = buildSpeakerOrder(segments)

  if (!segments.length) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        暂无转写内容
      </div>
    )
  }

  return (
    <div className="flex select-text flex-col gap-5 p-4 sm:p-6">
      {speakerOrder.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-xl border bg-muted/20 px-3 py-2.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            说话人标签
          </span>
          {speakerOrder.map((source) => {
            const fallback = fallbackSpeakers[source]
            const label = speakerLabelMap[source] ?? fallback?.label ?? source
            return (
              <button
                key={source}
                type="button"
                className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium transition-colors hover:border-foreground/20 hover:bg-foreground/5"
                onClick={() => {
                  const next = window.prompt(`重命名 ${label}`, label)?.trim()
                  if (!next || next === label || !onRenameSpeaker) return
                  void onRenameSpeaker(source, next)
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: fallback?.color ?? '#d1d5db' }} />
                {label}
              </button>
            )
          })}
        </div>
      )}
      {segments.map((seg) => {
        const fallback = seg.source ? fallbackSpeakers[seg.source] : undefined
        const label = seg.source ? speakerLabelMap[seg.source] ?? fallback?.label : undefined
        return (
          <TranscriptItem
            key={seg.id}
            segment={seg}
            speakerColor={fallback?.color}
            speakerLabel={label}
          />
        )
      })}
    </div>
  )
}
