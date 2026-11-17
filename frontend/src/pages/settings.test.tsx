import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from './settings'

const enumerateDevicesMock = vi.fn()
const getUserMediaMock = vi.fn()

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock.mockResolvedValue({}),
        enumerateDevices: enumerateDevicesMock.mockResolvedValue([
          { kind: 'audioinput', deviceId: 'mic-1', label: '会议麦克风' },
        ]),
      },
    })
  })

  it('hides model and key settings while keeping hot words and microphone controls', async () => {
    render(<SettingsPage />)

    expect(screen.queryByText('DashScope API Key')).not.toBeInTheDocument()
    expect(screen.queryByText('摘要 Provider')).not.toBeInTheDocument()
    expect(screen.queryByText('摘要模型')).not.toBeInTheDocument()
    expect(screen.queryByText('摘要 API Key')).not.toBeInTheDocument()

    expect(screen.getByText('会议热词 / 术语')).toBeInTheDocument()
    expect(screen.getByText('麦克风设备')).toBeInTheDocument()
  })

  it('saves only hot words and microphone settings locally', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)

    await user.type(screen.getAllByPlaceholderText('项目名 | 人名 | 产品名')[0], 'Alpha|Beta')
    await user.click(screen.getAllByRole('button', { name: '保存配置' })[0])

    expect(localStorage.getItem('hot_words')).toBe('Alpha|Beta')
    expect(localStorage.getItem('dashscope_api_key')).toBeNull()
    expect(localStorage.getItem('summary_provider')).toBeNull()
    expect(localStorage.getItem('summary_model')).toBeNull()
    expect(localStorage.getItem('summary_api_key')).toBeNull()
  })
})
