import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api-base', () => ({
  resolveApiBase: vi.fn(() => 'https://ai.infox-med.com:10443'),
}))

describe('api upload requests', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('omits cookies and maps fetch failures for uploaded audio', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const { api } = await import('./api')
    const file = new File(['audio'], 'demo.wav', { type: 'audio/wav' })

    await expect(api.uploadMeeting(file, 'demo')).rejects.toThrow('上传请求失败，请检查网络、文件格式或重新登录后重试。')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai.infox-med.com:10443/api/meetings/upload',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
      }),
    )
  })

  it('surfaces empty upload 400 responses with an explicit message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: vi.fn().mockRejectedValue(new Error('empty')),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { api } = await import('./api')
    const file = new File(['audio'], 'demo.wav', { type: 'audio/wav' })

    await expect(api.uploadMeeting(file, 'demo')).rejects.toThrow('上传失败（400 Bad Request）')
  })
})
