import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const DEFAULT_MIC_DEVICE = '__default__'

export default function SettingsPage() {
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [micDeviceId, setMicDeviceId] = useState(DEFAULT_MIC_DEVICE)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    setMicDeviceId(localStorage.getItem('mic_device_id') ?? DEFAULT_MIC_DEVICE)

    if (!navigator.mediaDevices) return

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(() => navigator.mediaDevices.enumerateDevices())
      .then((devices) => setMicDevices(devices.filter((d) => d.kind === 'audioinput')))
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSavedMsg('')

    try {
      if (micDeviceId === DEFAULT_MIC_DEVICE) {
        localStorage.removeItem('mic_device_id')
      } else {
        localStorage.setItem('mic_device_id', micDeviceId)
      }

      setSavedMsg('配置已保存')
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge className="px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em]">
          配置中心
        </Badge>
      </div>

      <h1 className="mb-6 text-2xl font-bold tracking-tight">设置</h1>

      <div className="max-w-md">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">录音偏好</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">麦克风设备</Label>
              <Select value={micDeviceId} onValueChange={setMicDeviceId}>
                <SelectTrigger>
                  <SelectValue placeholder="默认麦克风" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_MIC_DEVICE}>默认麦克风</SelectItem>
                  {micDevices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `麦克风 ${d.deviceId.slice(0, 8)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => void handleSave()} disabled={saving} className="w-full rounded-full">
              {saving ? '保存中...' : savedMsg || '保存配置'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
