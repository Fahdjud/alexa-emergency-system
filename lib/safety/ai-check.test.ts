// Tests for the rules applied to the language model's answer.
import { describe, expect, it } from "vitest"

import { isIncident, severityFor, verifiedQuote } from "./ai-check"
import type { Classification } from "./schemas"

const classification = (incidentType: Classification["incidentType"], confidence: number): Classification => ({
  incidentType,
  confidence,
  severity: null,
  supportingQuote: null,
  source: "anthropic",
})

describe("isIncident", () => {
  it("dismisses only when the model is confident nothing is wrong", () => {
    expect(isIncident(classification("none", 0.9))).toBe(false)
    expect(isIncident(classification("none", 0.79))).toBe(true)
    expect(isIncident(classification("help_call", 0.2))).toBe(true)
  })
})

describe("verifiedQuote", () => {
  it("keeps exact quotes, ignoring case and punctuation", () => {
    expect(verifiedQuote("I can't breathe", "Oh no, I CAN'T breathe!")).toBe("I can't breathe")
    expect(verifiedQuote("الحقوني", "يا ناس الحقوني")).toBe("الحقوني")
  })

  it("drops paraphrased or empty quotes", () => {
    expect(verifiedQuote("I am unable to breathe", "I can't breathe")).toBeNull()
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
