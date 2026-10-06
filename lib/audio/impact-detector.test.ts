// Tests for spotting sudden loud impacts.
import { describe, expect, it } from "vitest"

import { ImpactDetector } from "./impact-detector"

/** Feeds loudness values 100 ms apart; returns the times (ms) flagged as impacts. */
function impactsIn(levels: number[], detector = new ImpactDetector()) {
  return levels.flatMap((level, i) =>
    detector.push(level, i * 100) !== null ? [i * 100] : []
  )
}

const quiet = (n: number, level = 0.03) => Array<number>(n).fill(level)

describe("ImpactDetector", () => {
  it("flags a loud spike over a quiet room", () => {
    expect(impactsIn([...quiet(30), 0.8, ...quiet(10)])).toEqual([3100])
  })

  it("ignores steady loud sound such as music or a vacuum", () => {
    expect(impactsIn([...quiet(10), ...quiet(100, 0.5)])).toEqual([])
  })

  it("ignores spikes that are too quiet overall", () => {
    expect(impactsIn([...quiet(30, 0.01), 0.2, ...quiet(10, 0.01)])).toEqual([])
  })

  it("reports one impact per fall, then can report the next one", () => {
    const fall = [0.9, 0.6]
    expect(
      impactsIn([...quiet(30), ...fall, ...quiet(60), ...fall, ...quiet(5)])
    ).toEqual([3200, 9400])
  })
})

describe("ImpactDetector peak and short sounds", () => {
  it("reports the peak loudness, not the faded level", () => {
    const detector = new ImpactDetector()
    const results = [...quiet(30), 0.8, 0.03].map((level, i) =>
      detector.push(level, i * 100)
    )
    expect(results.at(-1)).toBe(0.8)
  })

  it("ignores a loud sound lasting longer than an impact (a beep or a shout)", () => {
    expect(impactsIn([...quiet(30), 0.8, 0.8, 0.8, 0.8, ...quiet(10)])).toEqual(
      []
    )
  })
})
