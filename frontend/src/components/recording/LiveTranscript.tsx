import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTranscriptStore } from '@/store/transcriptStore'

export default function LiveTranscript() {
  const segments = useTranscriptStore((s) => s.segments)
  const partialText = useTranscriptStore((s) => s.partialText)
  const speakers = useTranscriptStore((s) => s.speakers)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments.length, partialText])

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-3 p-6 pb-8">
        {segments.length === 0 && !partialText && (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            等待语音输入...
          </div>
        )}

        {segments.map((seg) => {
          const speaker = seg.source ? speakers[seg.source] : null
          return (
            <div key={seg.id} className="flex gap-3">
              <div
                className="w-1.5 flex-shrink-0 rounded-full"
                style={{
                  backgroundColor: speaker?.color ?? '#d1d5db',
                  alignSelf: 'stretch',
                  minHeight: 16,
                }}
              />
              <div className="flex-1 min-w-0">
                {speaker && (
                  <span
                    className="text-xs font-semibold block mb-1"
                    style={{ color: speaker.color }}
                  >
                    {speaker.label}
                  </span>
                )}
                <p className="text-sm leading-relaxed text-foreground">{seg.text}</p>
              </div>
            </div>
          )
        })}

        {partialText && (
          <div className="flex gap-3 opacity-60">
            <div
              className="w-1.5 flex-shrink-0 bg-blue-400 rounded-full"
              style={{ alignSelf: 'stretch', minHeight: 16 }}
            />
            <p className="text-sm leading-relaxed text-muted-foreground italic">
              {partialText}
              <span className="inline-block w-0.5 h-4 bg-blue-400 ml-0.5 animate-pulse align-text-bottom" />
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
