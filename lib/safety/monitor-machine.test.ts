// Tests for the monitor's state machine and its safety rules.
import { describe, expect, it } from "vitest"

import { CONFIRMATION_TIMEOUT_MS } from "./incidents"
import {
  initialMonitorState,
  monitorReducer,
  type MonitorEvent,
  type MonitorState,
  whyTriggerIgnored,
} from "./monitor-machine"
import type { TriggerMatch } from "./types"

const fallSound: TriggerMatch = {
  incidentId: "fall",
  source: "sound",
  label: "Thump, thud",
  score: 0.9,
}
const helpSpeech: TriggerMatch = {
  incidentId: "help_call",
  source: "speech",
  phrase: "help",
  language: "en",
}
const breathSpeech: TriggerMatch = {
  incidentId: "medical_distress",
  source: "speech",
  phrase: "cannot breathe",
  language: "en",
}
const glassSound: TriggerMatch = {
  incidentId: "glass_break",
  source: "sound",
  label: "Shatter",
  score: 0.9,
}

const run = (
  events: MonitorEvent[],
  from: MonitorState = initialMonitorState
) => events.reduce(monitorReducer, from)
const listening = run([{ type: "start" }])

describe("monitorReducer", () => {
  it("asks straight away for triggers that skip the AI check", () => {
    const state = run(
      [{ type: "trigger", match: fallSound, needsAiCheck: false, nowMs: 0 }],
      listening
    )
    expect(state).toMatchObject({
      phase: "confirming",
      deadlineMs: CONFIRMATION_TIMEOUT_MS,
      timesAsked: 1,
    })
  })

  it("checks speech triggers first, and dismisses them when the AI says no", () => {
    const checking = run(
      [{ type: "trigger", match: helpSpeech, needsAiCheck: true, nowMs: 0 }],
      listening
    )
    expect(checking.phase).toBe("checking")
    expect(
      run([{ type: "ai-check-done", isIncident: false, nowMs: 2000 }], checking)
        .phase
    ).toBe("listening")
    expect(
      run([{ type: "ai-check-done", isIncident: true, nowMs: 2000 }], checking)
    ).toMatchObject({
      phase: "confirming",
      deadlineMs: 2000 + CONFIRMATION_TIMEOUT_MS,
    })
  })

  it("still asks when the AI check fails", () => {
    const state = run(
      [
        { type: "trigger", match: helpSpeech, needsAiCheck: true, nowMs: 0 },
        { type: "ai-check-failed", nowMs: 5000 },
      ],
      listening
    )
    expect(state.phase).toBe("confirming")
  })

  const confirming = run(
    [{ type: "trigger", match: fallSound, needsAiCheck: false, nowMs: 0 }],
    listening
  )

  it("cancels on 'fine' and escalates on 'help'", () => {
    expect(
      run([{ type: "reply", intent: "fine", nowMs: 1 }], confirming).phase
    ).toBe("cancelled")
    expect(
      run([{ type: "reply", intent: "help", nowMs: 1 }], confirming)
    ).toMatchObject({ phase: "escalated", reason: "asked-for-help" })
  })

  it("asks again on an unclear answer without moving the deadline", () => {
    const state = run(
      [{ type: "reply", intent: "unclear", nowMs: 10_000 }],
      confirming
    )
    expect(state).toMatchObject({
      phase: "confirming",
      timesAsked: 2,
      deadlineMs: CONFIRMATION_TIMEOUT_MS,
    })
  })

  it("escalates when nobody answers in time", () => {
    expect(
      run([{ type: "tick", nowMs: CONFIRMATION_TIMEOUT_MS - 1 }], confirming)
        .phase
    ).toBe("confirming")
    expect(
      run([{ type: "tick", nowMs: CONFIRMATION_TIMEOUT_MS }], confirming)
    ).toMatchObject({ phase: "escalated", reason: "no-answer" })
  })

  it("switches to a more severe incident but ignores a less severe one", () => {
    expect(
      run(
        [{ type: "trigger", match: glassSound, needsAiCheck: false, nowMs: 5 }],
        confirming
      )
    ).toBe(confirming)
    const switched = run(
      [{ type: "trigger", match: breathSpeech, needsAiCheck: true, nowMs: 5 }],
      confirming
    )
    expect(switched).toMatchObject({
      phase: "checking",
      incident: { incidentId: "medical_distress" },
    })
  })

  it("resumes listening after an incident, and stops from any state", () => {
    const cancelled = run(
      [{ type: "reply", intent: "fine", nowMs: 1 }],
      confirming
    )
    expect(run([{ type: "resume" }], cancelled).phase).toBe("listening")
    expect(run([{ type: "stop" }], confirming).phase).toBe("idle")
  })
})

describe("whyTriggerIgnored", () => {
  it("agrees with the reducer about which triggers are acted on", () => {
    const confirming = run(
      [{ type: "trigger", match: fallSound, needsAiCheck: false, nowMs: 0 }],
      listening
    )
    expect(whyTriggerIgnored(listening, glassSound)).toBeNull()
    expect(whyTriggerIgnored(initialMonitorState, glassSound)).toMatch(
      /Not listening/
    )
    expect(whyTriggerIgnored(confirming, glassSound)).toMatch(
      /Already asking about: Possible fall/
    )
    expect(whyTriggerIgnored(confirming, breathSpeech)).toBeNull()
    expect(
      whyTriggerIgnored(
        run([{ type: "reply", intent: "fine", nowMs: 1 }], confirming),
        glassSound
      )
    ).toMatch(/Just finished/)
  })
})
