// AudioWorklet 处理器：Float32 → Int16 PCM，每 100ms（1600 样本 @ 16kHz）发一帧
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buf = new Int16Array(1600)
    this._offset = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true

    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]))
      this._buf[this._offset++] = s < 0 ? s * 0x8000 : s * 0x7fff
      if (this._offset >= 1600) {
        this.port.postMessage(this._buf.buffer, [this._buf.buffer])
        this._buf = new Int16Array(1600)
        this._offset = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
