import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Mic, MicOff, Send, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useRecordingStore } from '@/store/recordingStore'
import { useTranscriptStore } from '@/store/transcriptStore'
import { useMeetingStore } from '@/store/meetingStore'
import { useRecording } from '@/hooks/useRecording'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import AudioWaveform from '@/components/recording/AudioWaveform'
import type { MeetingChatMessage } from '@/types'

function genId() { return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
function meetingId() { return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }

function formatNow() {
  return new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

type MeetingMode = 'recording' | 'summary'

export default function RealtimeMeetingPage() {
  const status = useRecordingStore((s) => s.status)
  const setStatus = useRecordingStore((s) => s.setStatus)
  const segments = useTranscriptStore((s) => s.segments)
  const partialText = useTranscriptStore((s) => s.partialText)
  const prevCount = useRef(0)
  const fetchMeetings = useMeetingStore((s) => s.fetchMeetings)
  const { start, stop } = useRecording()
  const navigate = useNavigate()

  const [messages, setMessages] = useState<MeetingChatMessage[]>([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<MeetingMode>('recording')
  const [summarizing, setSummarizing] = useState(false)
  const [notes, setNotes] = useState<Array<{ id: string; content: string; timestamp: string }>>([])
  const notesRef = useRef(notes)
  const summaryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSummarizedIndexRef = useRef(0)

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  const isActive = status === 'recording' || status === 'connecting' || status === 'stopping' || status === 'processing'
  const hasRecording = isActive || messages.length > 0

  // Poll transcript segments into chat messages (recording mode only)
  if (isActive && segments.length > prevCount.current) {
    if (mode === 'recording') {
      const newSegments = segments.slice(prevCount.current)
      const newMsgs = newSegments.map((seg) => ({
        id: genId(),
        role: 'system' as const,
        content: seg.text,
        timestamp: seg.timestamp,
      }))
      setMessages((prev) => [...prev, ...newMsgs])
    }
    prevCount.current = segments.length
  }

  const triggerSummary = useCallback(async () => {
    if (summarizing) return
    const currentSegments = useTranscriptStore.getState().segments
    const newSegments = currentSegments.slice(lastSummarizedIndexRef.current)
    if (newSegments.length === 0) return

    setSummarizing(true)
    const transcriptText = newSegments.map((s) => s.text).join('\n')
    const currentNotes = notesRef.current.map(({ content, timestamp }) => ({ content, timestamp }))

    try {
      const result = await api.realtimeSummarize(transcriptText, currentNotes)
      lastSummarizedIndexRef.current = currentSegments.length
      setMessages((prev) => [...prev, {
        id: genId(),
        role: 'summary' as const,
        content: result.ok ? result.summary : '摘要生成失败，将继续录制转写内容。',
        timestamp: new Date().toISOString(),
      }])
    } catch {
      // Network error — don't advance index, retry next tick
    } finally {
      setSummarizing(false)
    }
  }, [summarizing])

  // Summary timer: runs only in summary mode while recording is active
  useEffect(() => {
    if (mode === 'summary' && isActive) {
      summaryTimerRef.current = setInterval(() => {
        void triggerSummary()
      }, 60_000)
    } else {
      if (summaryTimerRef.current) {
        clearInterval(summaryTimerRef.current)
        summaryTimerRef.current = null
      }
    }
    return () => {
      if (summaryTimerRef.current) {
        clearInterval(summaryTimerRef.current)
        summaryTimerRef.current = null
      }
    }
  }, [mode, isActive, triggerSummary])

  const handleStart = useCallback(() => {
    prevCount.current = 0
    lastSummarizedIndexRef.current = 0
    setMessages([{
      id: genId(),
      role: 'system',
      content: mode === 'summary'
        ? '实时会议已开始（总结模式），正在录制并转写中，每分钟将自动生成摘要...'
        : '实时会议已开始，正在录制并转写中...',
    }])
    const micDeviceId = localStorage.getItem('mic_device_id') ?? undefined
    const hotWords = localStorage.getItem('hot_words') ?? ''
    void start({ source: 'mic', micDeviceId: micDeviceId || undefined, hotWords: hotWords || undefined })
  }, [start, mode])

  const handleStop = useCallback(async () => {
    // Trigger final summary if in summary mode
    if (mode === 'summary' && !summarizing) {
      await triggerSummary()
    }

    setSaving(true)
    await stop()
    const finalSegments = useTranscriptStore.getState().segments

    if (!finalSegments.length) {
      setMessages((prev) => [...prev, { id: genId(), role: 'system', content: '未检测到有效转写内容。' }])
      setStatus('idle')
      setSaving(false)
      return
    }

    try {
      const mid = meetingId()
      const title = `${formatNow()} 的会议`
      const hotWords = localStorage.getItem('hot_words') ?? ''
      await api.saveMeeting(mid, title, finalSegments, hotWords, undefined, notes)
      await fetchMeetings()
      setMessages((prev) => [...prev, {
        id: genId(),
        role: 'system',
        content: `会议已保存：${title}`,
      }])
      setStatus('idle')
      setTimeout(() => {
        void navigate({ to: '/meetings/$meetingId', params: { meetingId: mid } })
      }, 800)
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: genId(),
        role: 'system',
        content: `保存失败：${error instanceof Error ? error.message : '未知错误'}`,
      }])
      setStatus('idle')
    } finally {
      setSaving(false)
    }
  }, [stop, setStatus, fetchMeetings, navigate, mode, summarizing, triggerSummary])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    const note = { id: genId(), content: text, timestamp: new Date().toISOString() }
    setNotes((prev) => [...prev, note])
    setMessages((prev) => [...prev, { id: note.id, role: 'user', content: text, timestamp: note.timestamp }])
    setInput('')
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="text-sm font-semibold">实时会议</h1>
          <p className="text-xs text-muted-foreground">
            {isActive ? (mode === 'summary' ? '总结中...' : '录制中...') : hasRecording ? '会议已结束' : '开始新的实时会议'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 rounded-full border bg-muted p-0.5">
            <Button
              variant={mode === 'summary' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-full px-3 text-xs h-7"
              onClick={() => setMode('summary')}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              总结模式
            </Button>
            <Button
              variant={mode === 'recording' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-full px-3 text-xs h-7"
              onClick={() => setMode('recording')}
            >
              <Mic className="h-3 w-3 mr-1" />
              录制模式
            </Button>
          </div>

          {isActive && <AudioWaveform />}
          {isActive && (
            <Button variant="destructive" onClick={() => void handleStop()} disabled={saving} className="gap-2 rounded-full">
              <MicOff className="h-4 w-4" />
              {saving ? '保存中...' : '结束会议'}
            </Button>
          )}
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {!hasRecording && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Button onClick={handleStart} className="mt-4 gap-2 rounded-full">
              <Mic className="h-4 w-4" />
              开始会议
            </Button>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {mode === 'summary'
                ? '总结模式下，语音将实时转写并每分钟自动生成 AI 摘要。'
                : '点击上方按钮开始会议，语音内容将实时转写为文字显示在下方对话框。'}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : msg.role === 'summary'
                  ? 'bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-100'
                  : msg.role === 'system'
                    ? 'bg-muted text-foreground'
                    : 'bg-secondary text-secondary-foreground'
            }`}>
              {msg.role === 'summary' && (
                <div className="flex items-center gap-1.5 mb-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI 总结
                </div>
              )}
              {msg.role === 'summary' ? (
                <div className="prose prose-sm prose-amber max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {/* Summarizing indicator */}
        {summarizing && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-100">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI 总结
              </div>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">正在生成摘要...</p>
            </div>
          </div>
        )}

        {/* Live partial transcript */}
        {isActive && partialText && (
          <div key="partial" className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-muted/60 text-foreground/70 italic">
              {partialText}
              <span className="inline-block w-1 h-4 bg-primary ml-1 animate-pulse align-middle" />
            </div>
          </div>
        )}

        {isActive && segments.length === 0 && !partialText && (
          <p className="text-center text-xs text-muted-foreground py-4">等待语音输入...</p>
        )}
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 border-t bg-background/80 backdrop-blur p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={isActive ? '添加备注...' : '会议已结束'}
            rows={1}
            disabled={!hasRecording}
            className="flex-1 resize-none rounded-xl border bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <Button size="icon" onClick={handleSend} disabled={!input.trim()} className="h-10 w-10 shrink-0 rounded-xl">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
