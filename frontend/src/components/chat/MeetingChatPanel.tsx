import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, MessageSquare, Bot, User, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MeetingChatMessage } from '@/types'

interface Props {
  messages: MeetingChatMessage[]
  loading: boolean
  onSend: (question: string) => void
  placeholder?: string
  suggestions?: string[]
  emptyTitle?: string
  emptyDesc?: string
}

export default function MeetingChatPanel({
  messages,
  loading,
  onSend,
  placeholder = '输入消息...',
  suggestions = [],
  emptyTitle = '开始对话',
  emptyDesc = '发送消息开始互动。',
}: Props) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // Auto-focus after mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [loading])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    onSend(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">{emptyTitle}</h3>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">{emptyDesc}</p>
            {suggestions.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => { if (!loading) onSend(q) }}
                    className="rounded-full border bg-background/60 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role !== 'user' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                {msg.role === 'system' ? <Sparkles className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
            )}
            <div
              className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : msg.role === 'system'
                    ? 'bg-accent/60 text-accent-foreground'
                    : 'bg-muted/60 text-foreground'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              {msg.citations?.map((cit, i) => (
                <div key={i} className="mt-2 rounded-xl border bg-background/60 p-2 text-xs">
                  <span className="font-medium text-primary">{cit.speaker_label || '发言人'}</span>
                  <p className="mt-0.5 leading-relaxed text-muted-foreground line-clamp-2">{cit.text}</p>
                </div>
              ))}
            </div>
            {msg.role === 'user' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
            <div className="rounded-2xl bg-muted/60 px-4 py-3">
              <p className="text-sm text-muted-foreground">思考中...</p>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t bg-background/60 backdrop-blur p-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none rounded-xl border bg-background/70 backdrop-blur px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="h-10 w-10 shrink-0 rounded-xl"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {loading && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            正在分析会议内容，请稍候...
          </p>
        )}
      </div>
    </div>
  )
}
