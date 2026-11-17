import { describe, expect, it } from 'vitest'
import { buildWavBytesFromPcmChunks, buildWavFileFromPcmChunks } from './recording-wav'

describe('buildWavFileFromPcmChunks', () => {
  it('builds wav bytes with a valid header from PCM chunks', () => {
    const chunk = new Int16Array([0, 1200, -1200]).buffer

    const bytes = buildWavBytesFromPcmChunks([chunk], 16000)

    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE')
    expect(bytes.length).toBe(44 + 6)
  })

  it('wraps wav bytes into an uploadable file', () => {
    const chunk = new Int16Array([0, 1200, -1200]).buffer
    const file = buildWavFileFromPcmChunks([chunk], 16000, 'recording.wav')

    expect(file.name).toBe('recording.wav')
    expect(file.type).toBe('audio/wav')
    expect(file.size).toBe(44 + 6)
  })
})
