/*
 * ring-buffer.ts: a fixed-size buffer that always holds the most recent audio
 * samples, overwriting the oldest.
 *
 * Why this file exists: we must be able to send the seconds *before* a trigger
 * without ever storing continuous audio. A ring buffer keeps memory constant
 * (15 s at 16 kHz is about 1 MB) and forgets everything older automatically.
 */

export class RingBuffer {
  private readonly samples: Float32Array
  private writeIndex = 0
  private filled = 0

  constructor(capacity: number) {
    this.samples = new Float32Array(capacity)
  }

  get length(): number {
    return this.filled
  }

  push(chunk: Float32Array): void {
    // A chunk longer than the buffer: only its newest part can fit.
    const input =
      chunk.length > this.samples.length
        ? chunk.subarray(chunk.length - this.samples.length)
        : chunk
    const firstPart = Math.min(
      input.length,
      this.samples.length - this.writeIndex
    )
    this.samples.set(input.subarray(0, firstPart), this.writeIndex)
    this.samples.set(input.subarray(firstPart), 0)
    this.writeIndex = (this.writeIndex + input.length) % this.samples.length
    this.filled = Math.min(this.samples.length, this.filled + input.length)
  }

  /** A copy of the buffered audio, oldest sample first. */
  snapshot(): Float32Array {
    const result = new Float32Array(this.filled)
    const start =
      (this.writeIndex - this.filled + this.samples.length) %
      this.samples.length
    const firstPart = Math.min(this.filled, this.samples.length - start)
    result.set(this.samples.subarray(start, start + firstPart), 0)
    result.set(this.samples.subarray(0, this.filled - firstPart), firstPart)
    return result
  }

  clear(): void {
    this.samples.fill(0)
    this.writeIndex = 0
    this.filled = 0
  }
}
