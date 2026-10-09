// The accuracy scorecard (pnpm scorecard): prints each language's results and fails if one drops below the bar.
import { describe, expect, it } from "vitest"

import { formatScorecard, scoreAllLanguages } from "./scorecard"

const scores = scoreAllLanguages()

describe("accuracy scorecard", () => {
  it("prints the scorecard", () => {
    console.log(`\n${formatScorecard(scores)}\n`)
  })

  it.each(scores.map((score) => [score.language, score] as const))(
    "%s: catches every emergency sample and reads every answer",
    (_, score) => {
      expect(score.caught.missed).toEqual([])
      expect(score.replies.wrong).toEqual([])
    }
  )

  it.each(scores.map((score) => [score.language, score] as const))(
    "%s: flags at most 1 in 5 everyday samples (the hard cases)",
    (_, score) => {
      expect(score.everyday.flagged / score.everyday.total).toBeLessThanOrEqual(
        0.2
      )
    }
  )
})
