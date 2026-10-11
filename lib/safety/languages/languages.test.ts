// Checks every language pack is complete and consistent, so a new language cannot be half added.
import { describe, expect, it } from "vitest"

import { INCIDENTS } from "../incidents"
import { matchPhrase } from "../match-trigger"
import { normalizeText } from "../normalize-text"
import { LANGUAGE_PACKS, LANGUAGES } from "."

describe.each(LANGUAGES)("language pack %s", (language) => {
  const pack = LANGUAGE_PACKS[language]

  it("is registered under its own code", () => {
    expect(pack.code).toBe(language)
  })

  it("can be heard for every speech incident and asks a yes/no question", () => {
    for (const incident of INCIDENTS) {
      const words = pack.incidents[incident.id]
      expect(words.question.trim(), incident.id).toMatch(/[?؟]$/)
      if (incident.triggerSounds.length === 0)
        expect(words.phrases.length, incident.id).toBeGreaterThan(0)
    }
  })

  it("has no phrase that normalises to nothing", () => {
    const all = [
      ...Object.values(pack.incidents).flatMap((words) => [
        ...words.phrases,
        ...(words.wordPairs?.flat() ?? []),
      ]),
      ...pack.ignorePhrases,
      ...pack.replies.fine,
      ...pack.replies.help,
    ]
    for (const phrase of all) expect(normalizeText(phrase), phrase).not.toBe("")
  })

  it("never ignores one of its own trigger phrases", () => {
    for (const incident of INCIDENTS)
      for (const phrase of pack.incidents[incident.id].phrases)
        expect(
          matchPhrase(phrase, language).map((match) => match.incidentId),
          phrase
        ).toContain(incident.id)
  })

  it("says every line, with the contact's name where there is one", () => {
    const { lines } = pack
    for (const text of [
      lines.replyHint,
      lines.cancelled,
      lines.escalated,
      lines.test,
      lines.testHeard,
    ])
      expect(text.trim()).not.toBe("")
    for (const line of [lines.handling, lines.onTheWay, lines.calling])
      expect(line("Sara")).toContain("Sara")
  })
})
