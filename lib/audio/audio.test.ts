// Tests for the rolling buffer, snippet building, WAV encoding and the level meter.
import { describe, expect, it } from "vitest"

import { loudness } from "./level"
import { RingBuffer } from "./ring-buffer"
import { concatSamples, SnippetCollector } from "./snippet"
import { encodeWav } from "./wav"

const samples = (...values: number[]) => Float32Array.from(values)

describe("RingBuffer", () => {
  it("returns what was pushed while not yet full", () => {
    const buffer = new RingBuffer(5)
    buffer.push(samples(1, 2))
    buffer.push(samples(3))
    expect(Array.from(buffer.snapshot())).toEqual([1, 2, 3])
  })

  it("keeps only the newest samples, oldest first, once it wraps", () => {
    const buffer = new RingBuffer(4)
    buffer.push(samples(1, 2, 3))
    buffer.push(samples(4, 5, 6))
    expect(Array.from(buffer.snapshot())).toEqual([3, 4, 5, 6])
    expect(buffer.length).toBe(4)
  })

  it("handles a chunk longer than the buffer", () => {
    const buffer = new RingBuffer(3)
    buffer.push(samples(1, 2, 3, 4, 5))
    expect(Array.from(buffer.snapshot())).toEqual([3, 4, 5])
  })

  it("forgets everything on clear", () => {
    const buffer = new RingBuffer(3)
    buffer.push(samples(1, 2))
    buffer.clear()
    expect(buffer.snapshot().length).toBe(0)
  })
})

describe("SnippetCollector", () => {
  it("adds exactly the requested samples after the trigger", () => {
    const collector = new SnippetCollector(samples(1, 2), 3)
    expect(collector.add(samples(3, 4))).toBe(false)
    expect(collector.add(samples(5, 6, 7))).toBe(true)
    expect(collector.add(samples(8))).toBe(true)
    expect(Array.from(collector.result())).toEqual([1, 2, 3, 4, 5])
  })

  it("concatenates parts in order", () => {
    expect(Array.from(concatSamples([samples(1), samples(), samples(2, 3)]))).toEqual([1, 2, 3])
  })
})

describe("encodeWav", () => {
  it("writes a 16-bit mono PCM header and clipped samples", () => {
    const wav = new DataView(encodeWav(samples(0, 1, -1, 2), 16_000))
    const text = (offset: number) => String.fromCharCode(...new Uint8Array(wav.buffer, offset, 4))
    expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"])
    expect(wav.getUint16(22, true)).toBe(1) // mono
    expect(wav.getUint32(24, true)).toBe(16_000)
    expect(wav.getUint16(34, true)).toBe(16) // bits
    expect(wav.getUint32(40, true)).toBe(8) // 4 samples x 2 bytes
    expect([44, 46, 48, 50].map((offset) => wav.getInt16(offset, true))).toEqual([0, 32767, -32768, 32767])
  })
})

describe("loudness", () => {
  it("is 0 for silence and capped at 1", () => {
    expect(loudness(samples())).toBe(0)
    expect(loudness(samples(0, 0, 0))).toBe(0)
    expect(loudness(samples(1, -1, 1))).toBe(1)
    expect(loudness(samples(0.1, -0.1))).toBeCloseTo(0.4)
  })
})
