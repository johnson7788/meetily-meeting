function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

export function buildWavBytesFromPcmChunks(chunks: ArrayBuffer[], sampleRate: number) {
  const pcmSize = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const wavBuffer = new ArrayBuffer(44 + pcmSize)
  const view = new DataView(wavBuffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + pcmSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, pcmSize, true)

  let offset = 44
  chunks.forEach((chunk) => {
    new Uint8Array(wavBuffer, offset, chunk.byteLength).set(new Uint8Array(chunk))
    offset += chunk.byteLength
  })

  return new Uint8Array(wavBuffer)
}

export function buildWavFileFromPcmChunks(chunks: ArrayBuffer[], sampleRate: number, filename: string) {
  return new File([buildWavBytesFromPcmChunks(chunks, sampleRate)], filename, { type: 'audio/wav' })
}
