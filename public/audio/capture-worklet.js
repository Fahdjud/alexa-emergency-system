/*
 * AudioWorklet that forwards raw microphone samples to the page in small
 * chunks. Worklets are loaded by URL, so this is plain JavaScript in public/.
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
      const count = Math.min(
        channel.length - read,
        this.chunk.length - this.filled
      )
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
