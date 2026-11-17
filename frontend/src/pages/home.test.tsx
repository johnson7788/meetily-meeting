import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/services/api'
import RecordUploadPage from './RecordUpload'

const { startMock, stopMock, navigateMock, saveMeetingMock, uploadMeetingMock, setStatusMock, fetchMeetingsMock } = vi.hoisted(() => ({
  startMock: vi.fn(),
  stopMock: vi.fn(),
  navigateMock: vi.fn(),
  saveMeetingMock: vi.fn(async () => ({ meeting_id: 'm-save' })),
  uploadMeetingMock: vi.fn(async () => ({ meeting_id: 'm-upload', title: '会议录音' })),
  setStatusMock: vi.fn(),
  fetchMeetingsMock: vi.fn(),
}))

let recordingStatus: 'idle' | 'recording' = 'idle'
const transcriptStoreState = {
  segments: [
    {
      id: 'seg-1',
      text: '患者头痛三天',
      timestamp: '2026-04-02T10:00:00Z',
    },
  ],
  addUpdate: vi.fn(),
  clearAll: vi.fn(),
  clearPartial: vi.fn(),
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigateMock,
}))

vi.mock('@/hooks/useRecording', () => ({
  getRecordingAccessNotice: () => '点击开始录音后，浏览器会请求麦克风权限；允许后即可开始转写。',
  useRecording: () => ({
    start: startMock,
    stop: stopMock,
  }),
}))

vi.mock('@/components/recording/LiveTranscript', () => ({
  default: () => <div data-testid="live-transcript" />,
}))

vi.mock('@/services/api', () => ({
  api: {
    saveMeeting: saveMeetingMock,
    saveRecordedMeeting: vi.fn(),
    uploadMeeting: uploadMeetingMock,
  },
}))

vi.mock('@/store/recordingStore', () => ({
  useRecordingStore: (selector: (state: unknown) => unknown) =>
    selector({
      status: recordingStatus,
      errorMessage: '',
      setStatus: setStatusMock,
    }),
}))

vi.mock('@/store/transcriptStore', () => ({
  useTranscriptStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector(transcriptStoreState),
    {
      getState: () => transcriptStoreState,
    },
  ),
}))

vi.mock('@/store/meetingStore', () => ({
  useMeetingStore: (selector: (state: unknown) => unknown) =>
    selector({
      fetchMeetings: fetchMeetingsMock,
    }),
}))

describe('RecordUploadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    recordingStatus = 'idle'
    fetchMeetingsMock.mockResolvedValue(undefined)
    transcriptStoreState.segments = [
      {
        id: 'seg-1',
        text: '患者头痛三天',
        timestamp: '2026-04-02T10:00:00Z',
      },
    ]
  })

  it('shows only the microphone recording entry and starts recording from the homepage', async () => {
    localStorage.setItem('mic_device_id', 'mic-123')
    localStorage.setItem('hot_words', '项目A|项目B')

    const user = userEvent.setup()
    render(<RecordUploadPage />)

    expect(screen.getAllByRole('button', { name: /麦克风录音/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '系统音频录音' })).toBeNull()

    await user.click(screen.getAllByRole('button', { name: /麦克风录音/ })[0])

    expect(startMock).toHaveBeenCalledWith({
      source: 'mic',
      micDeviceId: 'mic-123',
      hotWords: '项目A|项目B',
    })
  })

  it('removes the deleted form fields from the homepage', () => {
    render(<RecordUploadPage />)

    screen.getAllByTestId('recording-entry-mic-content').forEach((element) => {
      expect(element).toHaveClass('min-w-0')
    })
    screen.getAllByTestId('recording-entry-mic-desc').forEach((element) => {
      expect(element).toHaveClass('break-words')
    })
    expect(screen.queryByRole('button', { name: '开始麦克风录音' })).toBeNull()
    expect(screen.queryByPlaceholderText('标题（可选，默认用文件名）')).toBeNull()
    expect(screen.queryAllByPlaceholderText('项目名称（可选）')).toHaveLength(0)
  })

  it('removes demo-heavy homepage copy and keeps the core actions visible', () => {
    render(<RecordUploadPage />)

    expect(screen.getAllByText('录音、转写、整理会议内容').length).toBeGreaterThan(0)
    expect(screen.queryByText('演示提示')).toBeNull()
    expect(screen.queryByText('结果沉淀')).toBeNull()
    expect(screen.getAllByText('上传音频转写').length).toBeGreaterThan(0)
  })

  it('uploads an audio file with the default file name only', async () => {
    const user = userEvent.setup()
    render(<RecordUploadPage />)

    const file = new File(['audio'], 'demo.wav', { type: 'audio/wav' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await user.click(screen.getAllByRole('button', { name: '开始转写' }).find((button) => !button.hasAttribute('disabled')) as HTMLButtonElement)

    await waitFor(() => {
      expect(uploadMeetingMock).toHaveBeenCalledWith(file, 'demo')
    })
  })

  it('saves realtime transcript segments without uploading the wav recording', async () => {
    const user = userEvent.setup()
    recordingStatus = 'recording'
    stopMock.mockResolvedValue({
      audioFile: new File(['wav-bytes'], 'recording.wav', { type: 'audio/wav' }),
    })

    const { container } = render(<RecordUploadPage />)

    await user.click(container.querySelector('button.bg-destructive') as HTMLButtonElement)

    expect(stopMock).toHaveBeenCalled()
    expect(saveMeetingMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('会议'),
      [{ id: 'seg-1', text: '患者头痛三天', timestamp: '2026-04-02T10:00:00Z' }],
      '',
    )
    expect(api.saveRecordedMeeting).not.toHaveBeenCalled()
  })

  it('does not save a recording when no transcript was collected', async () => {
    const user = userEvent.setup()
    recordingStatus = 'recording'
    stopMock.mockResolvedValue({
      audioFile: new File(['wav-bytes'], 'recording.wav', { type: 'audio/wav' }),
    })
    transcriptStoreState.segments = []

    const { container } = render(<RecordUploadPage />)

    await user.click(container.querySelector('button.bg-destructive') as HTMLButtonElement)

    expect(stopMock).toHaveBeenCalled()
    expect(api.saveMeeting).not.toHaveBeenCalled()
    expect(api.saveRecordedMeeting).not.toHaveBeenCalled()
    expect(setStatusMock).toHaveBeenCalledWith('idle', '未检测到有效转写内容，请检查麦克风权限、输入音量后重试。')
  })
})
