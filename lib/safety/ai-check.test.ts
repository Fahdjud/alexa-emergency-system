// Tests for the rules applied to the language model's answer.
import { describe, expect, it } from "vitest"

import {
  isIncident,
  safeDismissThreshold,
  severityFor,
  verifiedQuote,
} from "./ai-check"
import type { Classification } from "./schemas"

const classification = (
  incidentType: Classification["incidentType"],
  confidence: number
): Classification => ({
  incidentType,
  confidence,
  severity: null,
  supportingQuote: null,
  source: "anthropic",
})

describe("isIncident", () => {
  it("dismisses only when the model is confident nothing is wrong", () => {
    expect(isIncident(classification("none", 0.9), "the film says help")).toBe(
      false
    )
    expect(isIncident(classification("none", 0.79), "help")).toBe(true)
    expect(isIncident(classification("help_call", 0.2), "help")).toBe(true)
  })

  it("never dismisses when there was no transcript to judge", () => {
    expect(isIncident(classification("none", 1), "")).toBe(true)
    expect(isIncident(classification("none", 1), "   ")).toBe(true)
  })
})

describe("verifiedQuote", () => {
  it("keeps exact quotes, ignoring case and punctuation", () => {
    expect(verifiedQuote("I can't breathe", "Oh no, I CAN'T breathe!")).toBe(
      "I can't breathe"
    )
    expect(verifiedQuote("الحقوني", "يا ناس الحقوني")).toBe("الحقوني")
  })

  it("drops paraphrased or empty quotes", () => {
    expect(
      verifiedQuote("I am unable to breathe", "I can't breathe")
    ).toBeNull()
    expect(verifiedQuote("", "help")).toBeNull()
    expect(verifiedQuote(null, "help")).toBeNull()
  })
})

describe("severityFor", () => {
  it("takes severity from the config", () => {
    expect(severityFor("medical_distress")).toBe("critical")
    expect(severityFor("glass_break")).toBe("medium")
    expect(severityFor("none")).toBeNull()
  })
})

describe("household threshold", () => {
  it("uses the household's threshold, kept within a safe range", () => {
    const none = classification("none", 0.85)
    expect(isIncident(none, "the film says help", 0.9)).toBe(true)
    expect(isIncident(none, "the film says help", 0.75)).toBe(false)
    expect(safeDismissThreshold("0.9")).toBe(0.9)
    expect(safeDismissThreshold("0.1")).toBe(0.7)
    expect(safeDismissThreshold(undefined)).toBe(0.8)
    expect(safeDismissThreshold("abc")).toBe(0.8)
  })
})
