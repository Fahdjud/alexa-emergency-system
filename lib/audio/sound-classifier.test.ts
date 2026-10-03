// Tests for turning YAMNet results into score frames.
import { describe, expect, it } from "vitest"

import { highestScores, topSounds } from "./sound-classifier"

const result = (scores: Record<string, number>) => ({
  classifications: [
    {
      headIndex: 0,
      headName: "scores",
      categories: Object.entries(scores).map(
        ([categoryName, score], index) => ({
          categoryName,
          score,
          index,
          displayName: "",
        })
      ),
    },
  ],
})

describe("highestScores", () => {
  it("keeps each label's highest score across windows", () => {
    expect(
      highestScores([
        result({ Glass: 0.2, Speech: 0.9 }),
        result({ Glass: 0.7, Speech: 0.1 }),
      ])
    ).toEqual({ Glass: 0.7, Speech: 0.9 })
    expect(highestScores([])).toEqual({})
  })
})

describe("topSounds", () => {
  it("lists the strongest sounds first", () => {
    const frame = { timeMs: 0, scores: { A: 0.1, B: 0.9, C: 0.5, D: 0.3 } }
    expect(topSounds(frame, 2)).toEqual([
      { label: "B", score: 0.9 },
      { label: "C", score: 0.5 },
    ])
  })
})
