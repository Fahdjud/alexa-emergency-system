/*
 * capture-worklet.js: an AudioWorklet that forwards raw microphone samples to
 * the page in small chunks.
 *
 * Why this file exists: the demo's Web Speech API only returns text, never
 * audio, so it cannot fill a rolling buffer or feed a sound classifier.
 * AudioWorklets must be loaded by URL as plain JavaScript, so this file lives
 * in public/ instead of being bundled TypeScript.
 */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.chunk = new Float32Array(options.processorOptions.chunkSize)
    this.filled = 0
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true

    let read = 0
    while (read < channel.length) {
      const count = Math.min(channel.length - read, this.chunk.length - this.filled)
      this.chunk.set(channel.subarray(read, read + count), this.filled)
      this.filled += count
      read += count
      if (this.filled === this.chunk.length) {
        this.port.postMessage(this.chunk)
        this.chunk = new Float32Array(this.chunk.length)
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor("capture-processor", CaptureProcessor)
