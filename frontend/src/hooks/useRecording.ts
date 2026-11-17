import { useCallback, useRef } from 'react'
import { useRecordingStore } from '@/store/recordingStore'
import { useTranscriptStore } from '@/store/transcriptStore'
import { resolveApiBase, resolveWebSocketUrl } from '@/services/api-base'
import type { RecordingSource, RecordingStartOptions, RecordingStopResult, WsMessage } from '@/types'

export function resolveRecordingWsUrl() {
  const apiBase = resolveApiBase(window.location.href, import.meta.env.VITE_API_BASE as string | undefined)
  return resolveWebSocketUrl(apiBase, '/ws/record')
}

const WS_URL = resolveRecordingWsUrl()
const WS_CONNECT_TIMEOUT_MS = 12000
const ACCESS_NOTICE = '录音需要 HTTPS 或 localhost 访问，并授权麦克风权限。'

function resolveRecordingWorkletUrl() {
  const baseUrl = (import.meta.env.BASE_URL as string) || '/'
  return new URL('worklets/pcm-processor.js', `https://local.test${baseUrl}`).pathname
}

export function openRecordingSocket(
  url: string,
  createSocket: (nextUrl: string) => WebSocket = (nextUrl) => new WebSocket(nextUrl),
  timeoutMs: number = WS_CONNECT_TIMEOUT_MS,
) {
  const ws = createSocket(url)

  const connectPromise = new Promise<WebSocket>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      ws.close()
      reject(new Error('WebSocket 连接超时'))
    }, timeoutMs)

    const clearConnectTimer = () => window.clearTimeout(timer)

    ws.onopen = () => {
      clearConnectTimer()
      console.log('[录音] WebSocket 连接成功')
      resolve(ws)
    }
    ws.onerror = (ev) => {
      clearConnectTimer()
      console.error('[录音] WebSocket 连接失败', ev)
      reject(new Error('WebSocket 连接失败，请确认后端已启动'))
    }
  })

  return { ws, connectPromise }
}

function getSecureContextMessage() {
  return ACCESS_NOTICE
}

function getDeniedMessage(source: RecordingSource) {
  return source === 'system'
    ? '未授权系统音频录制，请在浏览器弹窗中选择带音频的共享源后重试。'
    : '未授权麦克风。请点击浏览器地址栏的麦克风图标允许访问后重试。'
}

function getRecordingErrorMessage(source: RecordingSource, err: unknown) {
  const reason = err instanceof Error ? err.message : String(err)

  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return getDeniedMessage(source)

    if (err.name === 'NotFoundError') {
      return source === 'system'
        ? '当前未找到可录制的系统音频，请切换到支持音频的共享源后重试。'
        : '未找到可用麦克风，请检查设备连接。'
    }

    if (err.name === 'NotReadableError') {
      return source === 'system'
        ? '系统音频当前无法读取，请关闭占用共享源的窗口后重试。'
        : '麦克风当前无法读取，请关闭占用设备的应用后重试。'
    }

    if (err.name === 'AbortError') return '浏览器取消了录音授权，请重试。'
  }

  return source === 'system'
    ? `系统音频录音启动失败：${reason}`
    : `麦克风录音启动失败：${reason}`
}

export function getRecordingAccessNotice(source: RecordingSource) {
  return source === 'system'
    ? '系统音频录制需要共享带音频的标签页或窗口。'
    : '点击开始录音后，浏览器会请求麦克风权限；允许后即可开始转写。'
}

async function requestRecordingStream(source: RecordingSource, micDeviceId?: string) {
  if (!navigator.mediaDevices) {
    throw new Error('当前浏览器不支持录音设备访问')
  }

  if (source === 'system') {
    if (!navigator.mediaDevices.getDisplayMedia) {
      throw new Error('当前浏览器不支持系统音频录制，请使用 Chrome 或 Edge')
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    })
    const audioTrack = displayStream.getAudioTracks()[0]

    if (!audioTrack) {
      displayStream.getTracks().forEach((track) => track.stop())
      throw new Error('未捕获到系统音频，请重新选择带音频的共享源')
    }

    displayStream.getVideoTracks().forEach((track) => track.stop())
    return {
      stream: new MediaStream([audioTrack]),
      cleanupStream: displayStream,
    }
  }

  const audioConstraints: MediaTrackConstraints = {
    sampleRate: 16000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(micDeviceId ? { deviceId: { exact: micDeviceId } } : {}),
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
  return { stream, cleanupStream: stream }
}

export function useRecording() {
  const setStatus = useRecordingStore((s) => s.setStatus)
  const addUpdate = useTranscriptStore((s) => s.addUpdate)
  const clearAll = useTranscriptStore((s) => s.clearAll)
  const clearPartial = useTranscriptStore((s) => s.clearPartial)

  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onDoneRef = useRef<(() => void) | null>(null)

  function cleanup() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    workletNodeRef.current?.disconnect()
    audioCtxRef.current?.close().catch(() => {})
    wsRef.current?.close()
    streamRef.current = null
    workletNodeRef.current = null
    audioCtxRef.current = null
    wsRef.current = null
  }

  const start = useCallback(async ({ source, micDeviceId, hotWords }: RecordingStartOptions) => {
    if (!window.isSecureContext) {
      setStatus('idle', getSecureContextMessage())
      return
    }

    setStatus('connecting')
    clearAll()

    try {
      const { stream, cleanupStream } = await requestRecordingStream(source, micDeviceId)
      streamRef.current = cleanupStream

      const { ws, connectPromise } = openRecordingSocket(WS_URL)
      wsRef.current = ws
      await connectPromise

      ws.send(JSON.stringify({ action: 'start', hot_words: hotWords || '' }))

      ws.onmessage = (event) => {
        const msg: WsMessage = JSON.parse(event.data as string)
        if (msg.type === 'transcript') {
          addUpdate(msg.text, msg.is_partial, msg.sequence_id)
        } else if (msg.type === 'done') {
          clearPartial()
          onDoneRef.current?.()
          onDoneRef.current = null
        } else if (msg.type === 'error') {
          setStatus('idle', msg.message)
          cleanup()
        }
      }

      ws.onclose = (event) => {
        console.log('[录音] WebSocket 关闭 code=', event.code, 'reason=', event.reason)
        const status = useRecordingStore.getState().status
        if (status === 'recording') {
          setStatus('idle', '连接意外断开')
        }
      }

      const audioCtx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = audioCtx
      await audioCtx.audioWorklet.addModule(resolveRecordingWorkletUrl())
      if (audioCtx.state === 'suspended') await audioCtx.resume()

      const sourceNode = audioCtx.createMediaStreamSource(stream)
      const workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor')
      workletNodeRef.current = workletNode

      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(event.data)
        }
      }

      sourceNode.connect(workletNode)
      setStatus('recording')
    } catch (err) {
      const msg = getRecordingErrorMessage(source, err)
      console.error('[录音] 启动失败:', msg)
      setStatus('idle', msg)
      cleanup()
    }
  }, [setStatus, addUpdate, clearAll, clearPartial])

  const stop = useCallback((): Promise<RecordingStopResult> => {
    return new Promise((resolve) => {
      setStatus('stopping')

      streamRef.current?.getTracks().forEach((track) => track.stop())
      workletNodeRef.current?.disconnect()
      audioCtxRef.current?.close().catch(() => {})
      streamRef.current = null
      workletNodeRef.current = null
      audioCtxRef.current = null

      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setStatus('processing')
        resolve({})
        return
      }

      onDoneRef.current = () => {
        setStatus('processing')
        ws.close()
        wsRef.current = null
        resolve({})
      }

      ws.send(JSON.stringify({ action: 'stop' }))

      setTimeout(() => {
        if (onDoneRef.current) {
          onDoneRef.current = null
          setStatus('processing')
          ws.close()
          wsRef.current = null
          resolve({})
        }
      }, 10000)
    })
  }, [setStatus])

  return { start, stop }
}
