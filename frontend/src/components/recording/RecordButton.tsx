import { Button } from '@/components/ui/button'
import { Mic, Square, Loader2 } from 'lucide-react'
import type { RecordingStatus } from '@/types'

interface Props {
  status: RecordingStatus
  onStart: () => void
  onStop: () => void
}

export default function RecordButton({ status, onStart, onStop }: Props) {
  if (status === 'connecting' || status === 'stopping' || status === 'processing') {
    return (
      <Button size="icon" disabled className="w-16 h-16 rounded-full">
        <Loader2 className="w-7 h-7 animate-spin" />
      </Button>
    )
  }

  if (status === 'recording') {
    return (
      <Button
        size="icon"
        variant="destructive"
        className="w-16 h-16 rounded-full"
        onClick={onStop}
      >
        <Square className="w-7 h-7" />
      </Button>
    )
  }

  return (
    <Button
      size="icon"
      className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 shadow-lg"
      onClick={onStart}
    >
      <Mic className="w-7 h-7" />
    </Button>
  )
}
