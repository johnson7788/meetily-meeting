import { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Clock3, ListChecks, Mic, MessageCircle, Trash2 } from 'lucide-react'
import { api } from '@/services/api'
import { useMeetingStore } from '@/store/meetingStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const MEETING_LIST_SCROLL_KEY = 'meetily:meetings-scroll-y'

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function MeetingsPage() {
  const meetings = useMeetingStore((s) => s.meetings)
  const loading = useMeetingStore((s) => s.loading)
  const fetchMeetings = useMeetingStore((s) => s.fetchMeetings)
  const removeMeeting = useMeetingStore((s) => s.removeMeeting)

  useEffect(() => {
    void fetchMeetings()
  }, [fetchMeetings])

  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem(MEETING_LIST_SCROLL_KEY, String(window.scrollY))
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (loading || meetings.length === 0) return
    const saved = sessionStorage.getItem(MEETING_LIST_SCROLL_KEY)
    if (!saved) return
    const top = Number(saved)
    if (!Number.isFinite(top) || top < 0) return
    window.scrollTo({ top, behavior: 'auto' })
  }, [loading, meetings.length])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('确认删除这条会议记录？')) return
    await api.deleteMeeting(id)
    removeMeeting(id)
  }

  if (loading && meetings.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500">
        正在加载会议列表...
      </div>
    )
  }

  if (!meetings.length) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        <Card className="overflow-hidden border-dashed border-emerald-200/60">
          <CardContent className="grid gap-6 p-8 md:grid-cols-[1.1fr_0.9fr] md:p-10">
            <div className="space-y-4">
              <Badge className="px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em]">
                会议工作台
              </Badge>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">先开始一场会议，列表才会有内容</h1>
                <p className="max-w-xl text-sm leading-relaxed text-slate-500">
                  实时录音或上传音频后，转写、摘要和待办会自动进入这里，方便回看、导出和后续整理。
                </p>
              </div>
              <Link to="/">
                <Button className="rounded-xl px-5">
                  <ListChecks className="h-4 w-4" />
                  去首页开始录音
                </Button>
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
              <div className="rounded-2xl border border-emerald-100/60 bg-white/60 backdrop-blur p-4">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-400">沉淀内容</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  会议标题、转写片段、AI 摘要和待办会一起保留在工作台中。
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-100/60 bg-white/60 backdrop-blur p-4">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-400">后续操作</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  直接进入详情页继续生成摘要，或删除不需要的记录。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <div className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em]">
            会议工作台
          </Badge>
          <span className="text-xs text-slate-500">共 {meetings.length} 条记录</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">会议操作</h1>
        <div className="flex flex-wrap gap-4 pt-2">
          <Link to="/record-upload">
            <Button variant="outline" className="rounded-xl px-6 py-5 text-base font-medium border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50">
              <Mic className="h-5 w-5" />
              会议录音上传
            </Button>
          </Link>
          <Link to="/realtime">
            <Button variant="outline" className="rounded-xl px-6 py-5 text-base font-medium border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50">
              <MessageCircle className="h-5 w-5" />
              记录实时会议
            </Button>
          </Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">会议列表</h1>
      </div>

      <div className="space-y-6">
        <div className="grid gap-3">
          {meetings.map((m) => (
            <Link key={m.id} to="/meetings/$meetingId" params={{ meetingId: m.id }} className="block">
              <Card className="group border border-white/60 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-200/60">
                <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                      <Clock3 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          data-testid={`meeting-list-title-${m.id}`}
                          className="break-words text-sm font-medium leading-6 text-slate-800"
                        >
                          {m.title}
                        </p>
                        <Badge variant="secondary" className="px-2 py-0.5 text-[11px] font-medium">
                          已归档
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        创建于 {formatDateTime(m.created_at)} · 更新于 {formatDateTime(m.updated_at)}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0 text-slate-400 hover:text-red-500"
                    onClick={(e) => void handleDelete(m.id, e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
