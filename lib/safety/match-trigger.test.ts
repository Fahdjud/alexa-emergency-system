// Tests for the incident config, text normalisation and trigger matching.
import { describe, expect, it } from "vitest"

import { INCIDENTS } from "./incidents"
import {
  addSoundFrame,
  matchPhrase,
  matchSound,
  needsAiCheck,
  pickMostSevere,
  soundHistoryMs,
} from "./match-trigger"
import { normalizeText } from "./normalize-text"
import type { SoundFrame } from "./types"

const frame = (timeMs: number, scores: Record<string, number>): SoundFrame => ({
  timeMs,
  scores,
})

describe("incident config", () => {
  it("has unique ids", () => {
    const ids = INCIDENTS.map((incident) => incident.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("gives every incident a trigger and a question in both languages", () => {
    for (const incident of INCIDENTS) {
      const phraseCount =
        incident.triggerPhrases.en.length + incident.triggerPhrases.ar.length
      expect(
        incident.triggerSounds.length + phraseCount,
        incident.id
      ).toBeGreaterThan(0)
      expect(incident.confirmationQuestion.en).toMatch(/are you okay\?$/i)
      expect(incident.confirmationQuestion.ar).toContain("هل أنت بخير؟")
    }
  })

  it("has no phrase that normalises to nothing", () => {
    for (const incident of INCIDENTS) {
      for (const phrase of [
        ...incident.triggerPhrases.en,
        ...incident.triggerPhrases.ar,
      ]) {
        expect(normalizeText(phrase), `${incident.id}: ${phrase}`).not.toBe("")
      }
    }
  })
})

describe("normalizeText", () => {
  it("expands English contractions and strips punctuation", () => {
    expect(normalizeText("I've FALLEN!")).toBe("i have fallen")
    expect(normalizeText("I can’t breathe…")).toBe("i cannot breathe")
    expect(normalizeText("I can not breathe")).toBe("i cannot breathe")
    expect(normalizeText("Don't call")).toBe("do not call")
  })

  it("ignores Arabic diacritics, tatweel and letter variants", () => {
    expect(normalizeText("النَّجْدَة")).toBe(normalizeText("النجده"))
    expect(normalizeText("أنا بخيـــر؟")).toBe("انا بخير")
    expect(normalizeText("إسعاف")).toBe(normalizeText("اسعاف"))
  })
})

describe("matchPhrase", () => {
  it("matches English phrases whatever the contraction", () => {
    expect(
      matchPhrase("Help! I've fallen and I can't get up", "en").map(
        (m) => m.incidentId
      )
    ).toEqual(expect.arrayContaining(["fall", "help_call"]))
    expect(matchPhrase("I cannot breathe", "en")[0]).toMatchObject({
      incidentId: "medical_distress",
    })
  })

  it("matches Arabic phrases with or without hamza and diacritics", () => {
    expect(matchPhrase("ما اقدر اتنفس", "ar")[0]).toMatchObject({
      incidentId: "medical_distress",
    })
    expect(matchPhrase("الحقوني! طِحت", "ar").map((m) => m.incidentId)).toEqual(
      expect.arrayContaining(["fall", "help_call"])
    )
  })

  it("matches whole words only", () => {
    expect(matchPhrase("this is helpful", "en")).toEqual([])
    expect(matchPhrase("I'm on fire with this project", "en")).toEqual([])
  })

  it("quotes the longest matching phrase", () => {
    expect(matchPhrase("please help me", "en")[0]).toMatchObject({
      incidentId: "help_call",
      phrase: "help me",
    })
  })

  it("only uses the phrases of the given language", () => {
    expect(matchPhrase("help me", "ar")).toEqual([])
  })
})

describe("matchSound", () => {
  it("triggers on a single frame above the threshold", () => {
    const matches = matchSound([
      frame(0, { "Smoke detector, smoke alarm": 0.6 }),
    ])
    expect(matches).toEqual([
      {
        incidentId: "smoke_co_alarm",
        source: "sound",
        label: "Smoke detector, smoke alarm",
        score: 0.6,
      },
    ])
  })

  it("ignores scores below the threshold", () => {
    expect(matchSound([frame(0, { "Thump, thud": 0.2 })])).toEqual([])
  })

  it("requires sustained sounds to last", () => {
    const screaming = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) =>
        frame((from + i) * 1000, { Screaming: 0.8 })
      )

    expect(matchSound(screaming(0, 2))).toEqual([]) // only 2 s of history
    expect(matchSound(screaming(0, 6))[0]).toMatchObject({
      incidentId: "screaming_crying",
      label: "Screaming",
    })

    const mostlyQuiet = [...screaming(0, 6)].map((f, i) =>
      i % 2 === 0 ? f : frame(f.timeMs, { Screaming: 0.1 })
    )
    expect(matchSound(mostlyQuiet)).toEqual([])
  })
})

describe("pickMostSevere and needsAiCheck", () => {
  it("prefers the most severe incident", () => {
    const matches = matchPhrase("help, I can't breathe", "en")
    expect(pickMostSevere(matches)?.incidentId).toBe("medical_distress")
    expect(pickMostSevere([])).toBeNull()
  })

  it("checks speech triggers with AI but sends a fall sound straight to the question", () => {
    const [speech] = matchPhrase("help me", "en")
    const [sound] = matchSound([frame(0, { "Thump, thud": 0.9 })])
    expect(needsAiCheck(speech)).toBe(true)
    expect(needsAiCheck(sound)).toBe(false)
  })
})

describe("sound history", () => {
  it("keeps enough history for the longest sustained sound", () => {
    expect(soundHistoryMs()).toBe(10_000) // crying: 8 s + 2 s margin
  })

  it("drops frames older than the history window", () => {
    let frames: SoundFrame[] = []
    for (let second = 0; second <= 20; second++)
      frames = addSoundFrame(frames, frame(second * 1000, {}), 5000)
    expect(frames.map((f) => f.timeMs)).toEqual([
      15_000, 16_000, 17_000, 18_000, 19_000, 20_000,
    ])
  })
})
