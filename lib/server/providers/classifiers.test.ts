// Tests for the classifiers. The Claude API is replaced by a canned response; no network, no key.
import Anthropic from "@anthropic-ai/sdk"
import { describe, expect, it, vi } from "vitest"

import type { TriggerMatch } from "@/lib/safety/types"

import { createAnthropicClassifier } from "./classifier-anthropic"
import { rulesClassifier } from "./classifier-rules"

const helpTrigger: TriggerMatch = { incidentId: "help_call", source: "speech", phrase: "help", language: "en" }

/** A client whose HTTP layer returns `answer` as the model's JSON text. */
function fakeClaude(answer: object) {
  const fetch = vi.fn(async () =>
    Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-haiku-4-5",
      content: [{ type: "text", text: JSON.stringify(answer) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 900, output_tokens: 40 },
    }),
  )
  return { client: new Anthropic({ apiKey: "test-key", fetch, maxRetries: 0 }), fetch }
}

describe("anthropic classifier", () => {
  it("returns the model's answer, with severity from the config", async () => {
    const { client, fetch } = fakeClaude({ incidentType: "medical_distress", confidence: 0.9, supportingQuote: "I can't breathe" })
    const result = await createAnthropicClassifier(client).classify({ transcript: "help, I can't breathe", trigger: helpTrigger, language: "en" })
    expect(result).toEqual({
      incidentType: "medical_distress",
      severity: "critical",
      confidence: 0.9,
      supportingQuote: "I can't breathe",
      source: "anthropic",
    })

    const request = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(request.model).toBe("claude-haiku-4-5")
    expect(request.output_config.format.type).toBe("json_schema")
    expect(request.messages[0].content).toContain("<transcript>\nhelp, I can't breathe\n</transcript>")
  })

  it("drops an invented quote and clamps confidence", async () => {
    const { client } = fakeClaude({ incidentType: "none", confidence: 1.4, supportingQuote: "it was the television" })
    const result = await createAnthropicClassifier(client).classify({ transcript: "help me find my keys", trigger: helpTrigger, language: "en" })
    expect(result).toMatchObject({ incidentType: "none", severity: null, confidence: 1, supportingQuote: null })
  })
})

describe("rules classifier", () => {
  it("uses the transcript's most severe phrase", async () => {
    const result = await rulesClassifier.classify({ transcript: "help, my chest hurts", trigger: helpTrigger, language: "en" })
    expect(result).toEqual({ incidentType: "medical_distress", severity: "critical", confidence: 0.6, supportingQuote: "my chest hurts", source: "rules" })
  })

  it("falls back to the trigger and never answers none", async () => {
    const result = await rulesClassifier.classify({ transcript: "", trigger: helpTrigger, language: "en" })
    expect(result).toMatchObject({ incidentType: "help_call", confidence: 0.5, supportingQuote: null })
  })
})
