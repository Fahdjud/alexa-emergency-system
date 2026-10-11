/*
 * Builds the audio snippet for a trigger: the buffered seconds before it plus
 * a few seconds after. This snippet is the only audio that leaves the device.
 */

export class SnippetCollector {
  private readonly parts: Float32Array[]
  private collectedAfter = 0

  constructor(
    before: Float32Array,
    private readonly samplesAfter: number
  ) {
    this.parts = [before]
  }

  get isComplete(): boolean {
    return this.collectedAfter >= this.samplesAfter
  }

  /** Adds a chunk of live audio. Returns true once the snippet is complete. */
  add(chunk: Float32Array): boolean {
    if (this.isComplete) return true
    const needed = this.samplesAfter - this.collectedAfter
    const part = chunk.length > needed ? chunk.slice(0, needed) : chunk.slice()
    this.parts.push(part)
    this.collectedAfter += part.length
    return this.isComplete
  }

  result(): Float32Array {
    return concatSamples(this.parts)
  }
}

export function concatSamples(parts: Float32Array[]): Float32Array {
  const result = new Float32Array(
    parts.reduce((total, part) => total + part.length, 0)
  )
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}
