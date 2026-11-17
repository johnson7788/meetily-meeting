import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openRecordingSocket, resolveRecordingWsUrl, useRecording } from './useRecording'

const setStatus = vi.fn()
const addUpdate = vi.fn()
const clearAll = vi.fn()
const clearPartial = vi.fn()
const getDisplayMedia = vi.fn()
const getUserMedia = vi.fn()

let lastWebSocket: MockWebSocket | null = null
let lastAudioWorkletNode: MockAudioWorkletNode | null = null
let lastWebSocketUrl: string | null = null
let addModuleMock = vi.fn()

class MockAudioWorkletNode {
  port = { onmessage: null as ((event: MessageEvent<ArrayBuffer>) => void) | null }
  disconnect = vi.fn()

  constructor() {
    lastAudioWorkletNode = this
  }
}

class MockWebSocket {
  readyState = WebSocket.OPEN
  onopen: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor(url?: string) {
    lastWebSocketUrl = url ?? null
    lastWebSocket = this
    queueMicrotask(() => this.onopen?.())
  }
}

vi.mock('@/store/recordingStore', () => ({
  useRecordingStore: (selector: (state: unknown) => unknown) =>
    selector({
      setStatus,
      status: 'idle',
    }),
}))

vi.mock('@/store/transcriptStore', () => ({
  useTranscriptStore: (selector: (state: unknown) => unknown) =>
    selector({
      addUpdate,
      clearAll,
      clearPartial,
    }),
}))

function installMediaEnvironment() {
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value: true,
  })
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getDisplayMedia,
      getUserMedia,
    },
  })
  Object.defineProperty(window, 'WebSocket', {
    configurable: true,
    value: MockWebSocket,
  })
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: class {
      sampleRate = 16000
      state = 'running'
      audioWorklet = { addModule: addModuleMock }
      resume = vi.fn()
      close = vi.fn().mockResolvedValue(undefined)
      createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }))
    },
  })
  Object.defineProperty(window, 'AudioWorkletNode', {
    configurable: true,
    value: MockAudioWorkletNode,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  lastWebSocket = null
  lastAudioWorkletNode = null
  lastWebSocketUrl = null
  addModuleMock = vi.fn().mockResolvedValue(undefined)
})

describe('useRecording', () => {
  it('preserves the api base path prefix when resolving websocket urls', () => {
    vi.stubEnv('VITE_API_BASE', 'https://ai.infox-med.com:10443/dev')

    expect(resolveRecordingWsUrl()).toBe('wss://ai.infox-med.com:10443/dev/ws/record')
  })

  it('waits for a slow websocket handshake before timing out', async () => {
    vi.useFakeTimers()
    const delayedSocket = {
      onopen: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
      close: vi.fn(),
    } as unknown as WebSocket

    const { connectPromise } = openRecordingSocket(
      'ws://localhost:3000/ws/record',
      () => {
        setTimeout(() => delayedSocket.onopen?.(new Event('open')), 6000)
        return delayedSocket
      },
    )

    const pending = expect(connectPromise).resolves.toBe(delayedSocket)
    await vi.advanceTimersByTimeAsync(6000)
    await pending
    vi.useRealTimers()
  })

  it('requests microphone access before opening the websocket', async () => {
    installMediaEnvironment()
    const audioTrack = {
      kind: 'audio',
      label: '麦克风',
      getSettings: () => ({}),
      stop: vi.fn(),
    }
    const mockStream = {
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [],
      getTracks: () => [audioTrack],
    } as unknown as MediaStream
    getUserMedia.mockResolvedValue(mockStream)

    const { result } = renderHook(() => useRecording())

    await act(async () => {
      await result.current.start({ source: 'mic' })
    })

    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(lastWebSocket).not.toBeNull()
    expect(lastWebSocketUrl).toBe('ws://localhost:5167/ws/record')
    expect(addModuleMock).toHaveBeenCalledWith('/worklets/pcm-processor.js')
    expect(lastWebSocket?.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'start', hot_words: '' }),
    )
    expect(setStatus).toHaveBeenCalledWith('recording')
  })

  it('shows a clear message when microphone access is denied', async () => {
    installMediaEnvironment()
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))

    const { result } = renderHook(() => useRecording())

    await act(async () => {
      await result.current.start({ source: 'mic' })
    })

    expect(lastWebSocket).toBeNull()
    expect(setStatus).toHaveBeenLastCalledWith(
      'idle',
      '未授权麦克风。请点击浏览器地址栏的麦克风图标允许访问后重试。',
    )
  })

  it('does not keep a full wav copy when the recording stops', async () => {
    installMediaEnvironment()
    const audioTrack = {
      kind: 'audio',
      label: '麦克风',
      getSettings: () => ({}),
      stop: vi.fn(),
    }
    const mockStream = {
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [],
      getTracks: () => [audioTrack],
    } as unknown as MediaStream
    getUserMedia.mockResolvedValue(mockStream)

    const { result } = renderHook(() => useRecording())

    await act(async () => {
      await result.current.start({ source: 'mic' })
    })

    const chunk = new Int16Array([1]).buffer
    lastAudioWorkletNode?.port.onmessage?.({ data: chunk } as MessageEvent<ArrayBuffer>)

    let stopPromise: Promise<{ audioFile?: File }> | undefined
    await act(async () => {
      stopPromise = result.current.stop()
    })

    await act(async () => {
      lastWebSocket?.onmessage?.({
        data: JSON.stringify({ type: 'done' }),
      } as MessageEvent<string>)
    })

    const resultValue = await stopPromise
    expect(resultValue?.audioFile).toBeUndefined()
  })

  it('ignores heartbeat websocket messages', async () => {
    installMediaEnvironment()
    const audioTrack = {
      kind: 'audio',
      label: '麦克风',
      getSettings: () => ({}),
      stop: vi.fn(),
    }
    const mockStream = {
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [],
      getTracks: () => [audioTrack],
    } as unknown as MediaStream
    getUserMedia.mockResolvedValue(mockStream)

    const { result } = renderHook(() => useRecording())

    await act(async () => {
      await result.current.start({ source: 'mic' })
    })

    await act(async () => {
      lastWebSocket?.onmessage?.({
        data: JSON.stringify({ type: 'heartbeat' }),
      } as MessageEvent<string>)
    })

    expect(addUpdate).not.toHaveBeenCalled()
  })

  it('loads the recording worklet under the current base url', async () => {
    vi.stubEnv('BASE_URL', '/dev/')
    installMediaEnvironment()
    const audioTrack = {
      kind: 'audio',
      label: '麦克风',
      getSettings: () => ({}),
      stop: vi.fn(),
    }
    const mockStream = {
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [],
      getTracks: () => [audioTrack],
    } as unknown as MediaStream
    getUserMedia.mockResolvedValue(mockStream)

    const { result } = renderHook(() => useRecording())

    await act(async () => {
      await result.current.start({ source: 'mic' })
    })

    expect(addModuleMock).toHaveBeenCalledWith('/dev/worklets/pcm-processor.js')
  })
})
