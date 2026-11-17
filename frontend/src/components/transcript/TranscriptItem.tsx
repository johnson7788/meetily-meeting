import type { TranscriptSegment } from '@/types'

interface Props {
  segment: TranscriptSegment
  speakerColor?: string
  speakerLabel?: string
}

function parseRelativeTimestamp(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return null

  const parts = normalized.split(':')
  if (parts.length !== 2 && parts.length !== 3) return null
  if (parts.some((part) => !/^\d+$/.test(part))) return null

  const numbers = parts.map((part) => Number(part))
  if (parts.length === 2) {
    const [minutes, seconds] = numbers
    return minutes * 60 + seconds
  }

  const [hours, minutes, seconds] = numbers
  return hours * 3600 + minutes * 60 + seconds
}

function formatSeconds(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function formatTranscriptTime(segment: TranscriptSegment): string {
  if (segment.audio_start_time != null) {
    return formatSeconds(segment.audio_start_time)
  }

  const relativeSeconds = parseRelativeTimestamp(segment.timestamp)
  if (relativeSeconds != null) {
    return formatSeconds(relativeSeconds)
  }

  return new Date(segment.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function TranscriptItem({ segment, speakerColor, speakerLabel }: Props) {
  const timeLabel = formatTranscriptTime(segment)
  const originalText = segment.text.trim()
  const correctedText = segment.postprocessed_text?.trim()
  const translatedText = segment.translated_text?.trim()
  const showCorrection = correctedText && correctedText !== originalText
  const showTranslation = translatedText && translatedText !== (correctedText || originalText)

  return (
    <div id={segment.id} className="flex gap-4 py-2 scroll-mt-28">
      <div
        className="w-1.5 flex-shrink-0 rounded-full"
        style={{
          backgroundColor: speakerColor ?? '#d1d5db',
          alignSelf: 'stretch',
          minHeight: 20,
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="mb-1.5 flex items-baseline gap-2">
          {speakerLabel && (
            <span className="text-xs font-semibold" style={{ color: speakerColor }}>
              {speakerLabel}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{timeLabel}</span>
        </div>
        <p className="text-sm leading-7 text-foreground">{segment.text}</p>
        {showCorrection && (
          <div className="mt-3 rounded-md border border-dashed border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-700">术语校正</p>
            <p className="mt-1.5 text-sm leading-7 text-amber-950/90">{correctedText}</p>
          </div>
        )}
        {showTranslation && (
          <div className="mt-3 rounded-md border border-sky-200 bg-sky-50/80 px-3.5 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-sky-700">中文译文</p>
            <p className="mt-1.5 text-sm leading-7 text-sky-950/90">{translatedText}</p>
          </div>
        )}
      </div>
    </div>
  )
}
