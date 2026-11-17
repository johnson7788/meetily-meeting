import { useCallback, useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Mic, MicOff, Upload, FileAudio, ArrowRight, Send, Loader2 } from 'lucide-react'
import { useRecordingStore } from '@/store/recordingStore'
import { useTranscriptStore } from '@/store/transcriptStore'
import { useMeetingStore } from '@/store/meetingStore'
import { useRecording } from '@/hooks/useRecording'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import AudioWaveform from '@/components/recording/AudioWaveform'
import type { MeetingChatMessage } from '@/types'

function genId() { return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
function genMeetingId() { return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }

function formatNow() {
  return new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function RecordUploadPage({ compact: _compact }: { compact?: boolean }) {
  const status = useRecordingStore((s) => s.status)
  const errorMessage = useRecordingStore((s) => s.errorMessage)
  const setStatus = useRecordingStore((s) => s.setStatus)
  const segments = useTranscriptStore((s) => s.segments)
  const prevCount = useRef(0)
  const fetchMeetings = useMeetingStore((s) => s.fetchMeetings)
  const { stop } = useRecording()
  const navigate = useNavigate()

  const [messages, setMessages] = useState<MeetingChatMessage[]>([])
  const [input, setInput] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const isActive = status === 'recording' || status === 'connecting' || status === 'stopping' || status === 'processing'
  const hasContent = messages.length > 0

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Poll transcript segments into chat
  if (isActive && segments.length > prevCount.current) {
    const newSegs = segments.slice(prevCount.current)
    setMessages((prev) => [...prev, ...newSegs.map((seg) => ({
      id: genId(),
      role: 'system' as const,
      content: seg.text,
    }))])
    prevCount.current = segments.length
  }

  const handleStop = useCallback(async () => {
    await stop()
    const finalSegments = useTranscriptStore.getState().segments
    if (!finalSegments.length) {
      setMessages((prev) => [...prev, { id: genId(), role: 'system', content: '未检测到有效转写内容，请检查麦克风权限后重试。' }])
      setStatus('idle')
      return
    }
    try {
      const mid = genMeetingId()
      const title = `${formatNow()} 的会议`
      const hotWords = localStorage.getItem('hot_words') ?? ''
      await api.saveMeeting(mid, title, finalSegments, hotWords)
      await fetchMeetings()
      setMessages((prev) => [...prev, { id: genId(), role: 'system', content: `录音已保存：${title}` }])
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
    }
  }, [stop, setStatus, fetchMeetings, navigate])

  const handleUpload = async () => {
    if (!uploadFile) return
    setUploading(true)
    setUploadError('')
    try {
      const title = uploadFile.name.replace(/\.[^.]+$/, '')
      const result = await api.uploadMeeting(uploadFile, title)
      void fetchMeetings().catch(() => {})
      setMessages((prev) => [
        ...prev,
        { id: genId(), role: 'system', content: `上传完成：${title}` },
      ])
      setUploadFile(null)
      setTimeout(() => {
        void navigate({ to: '/meetings/$meetingId', params: { meetingId: result.meeting_id } })
      }, 800)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    setMessages((prev) => [...prev, { id: genId(), role: 'user', content: text }])
    setInput('')
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between border-b px-5 py-3">
        <div>
          <h1 className="text-sm font-semibold">会议录音</h1>
          <p className="text-xs text-muted-foreground">
            {isActive ? '录制中...' : hasContent ? '录音已保存' : '录制或上传音频进行转写'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isActive && <AudioWaveform />}
          {isActive && (
            <Button variant="destructive" onClick={() => void handleStop()} className="gap-2 rounded-full">
              <MicOff className="h-4 w-4" />
              停止录音
            </Button>
          )}
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {!hasContent && !isActive && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              上传音频文件进行转写。
            </p>

            {/* Upload area */}
            <div className="mt-6 w-full max-w-xs">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.mp4,.ogg,.flac,.webm,.aac"
                className="hidden"
                onChange={(e) => {
                  setUploadFile(e.target.files?.[0] ?? null)
                  setUploadError('')
                }}
              />
              {!uploadFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <Upload className="h-4 w-4" />
                  上传音频文件
                </button>
              ) : (
                <div className="rounded-xl border bg-muted/30 p-3 text-left">
                  <div className="flex items-center gap-2">
                    <FileAudio className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium truncate">{uploadFile.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  {uploadError && <p className="mt-2 text-xs text-red-500">{uploadError}</p>}
                  <Button onClick={() => void handleUpload()} disabled={uploading} className="mt-3 w-full rounded-xl" size="sm">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : '开始转写'}
                  </Button>
                </div>
              )}
            </div>

          </div>
        )}

        {errorMessage && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-500">{errorMessage}</p>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {isActive && segments.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-4">等待语音输入...</p>
        )}

        <div ref={messagesEndRef} />
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
            placeholder={hasContent || isActive ? '添加备注...' : '上传音频文件进行转写'}
            rows={1}
            disabled={!hasContent && !isActive}
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
