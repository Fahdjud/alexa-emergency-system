import { existsSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { LANGUAGE_PACKS } from "@/lib/safety/languages"
import { INCIDENTS } from "@/lib/safety/incidents"

import { PROMPT_IDS, QUESTION_PROMPT, promptUrl } from "./recorded-prompts"

describe("recorded prompts", () => {
  const recorded = Object.values(LANGUAGE_PACKS).filter(
    (pack) => pack.recordings !== undefined
  )

  it("are set up for English and Arabic", () => {
    expect(recorded.map((pack) => pack.code).sort()).toEqual(["ar", "en"])
  })

  it.each(recorded.map((pack) => [pack.code, pack.recordings!]))(
    "has every file for %s",
    (_, folder) => {
      const missing = PROMPT_IDS.filter(
        (id) => !existsSync(join("public", promptUrl(folder, id)))
      )
      expect(missing).toEqual([])
    }
  )

  it("has a question for every incident", () => {
    for (const incident of INCIDENTS)
      expect(PROMPT_IDS).toContain(QUESTION_PROMPT[incident.id])
  })
})
