// Tests for the escalation rules: who is alerted, when, and when we stop.
import { describe, expect, it } from "vitest"

import { buildEscalationPlan, isFirstAlertFor, nextEscalationAction } from "./escalation-policy"
import type { Contact } from "./types"

const MINUTE = 60_000
const contacts: Contact[] = [
  { id: "son", name: "Son", priority: 2 },
  { id: "daughter", name: "Daughter", priority: 1 },
]

describe("buildEscalationPlan", () => {
  it("alerts high-severity contacts one by one, 3 minutes apart, by priority", () => {
    const plan = buildEscalationPlan("high", contacts)
    expect(plan.steps.slice(0, 2)).toEqual([
      { offsetMs: 0, contactIds: ["daughter"] },
      { offsetMs: 3 * MINUTE, contactIds: ["son"] },
    ])
  })

  it("then alerts everyone together 3 times, 5 minutes apart, then gives up", () => {
    const plan = buildEscalationPlan("high", contacts)
    expect(plan.steps.slice(2).map((step) => step.offsetMs)).toEqual([6 * MINUTE, 11 * MINUTE, 16 * MINUTE])
    expect(plan.steps.slice(2).every((step) => step.contactIds.length === 2)).toBe(true)
    expect(plan.giveUpAtMs).toBe(21 * MINUTE)
  })

  it("waits 5 minutes per contact for medium severity", () => {
    expect(buildEscalationPlan("medium", contacts).steps[1].offsetMs).toBe(5 * MINUTE)
  })

  it("alerts everyone at once for critical, repeating every 2 minutes", () => {
    const plan = buildEscalationPlan("critical", contacts)
    expect(plan.steps.map((step) => step.offsetMs)).toEqual([0, 2 * MINUTE, 4 * MINUTE, 6 * MINUTE])
    expect(plan.steps[0].contactIds).toEqual(["daughter", "son"])
    expect(plan.giveUpAtMs).toBe(8 * MINUTE)
  })
})

describe("nextEscalationAction", () => {
  const plan = buildEscalationPlan("high", contacts)
  const startedAtMs = 1_000_000
  const at = (minutes: number, stepsSent: number, acknowledged = false) =>
    nextEscalationAction({ plan, startedAtMs, stepsSent, acknowledged, nowMs: startedAtMs + minutes * MINUTE })

  it("notifies the first contact immediately", () => {
    expect(at(0, 0)).toEqual({ type: "notify", stepIndex: 0, contactIds: ["daughter"] })
  })

  it("waits until the next step is due", () => {
    expect(at(1, 1)).toEqual({ type: "wait", untilMs: startedAtMs + 3 * MINUTE })
  })

  it("sends only the next step after a late tick, so nothing is skipped", () => {
    expect(at(10, 1)).toEqual({ type: "notify", stepIndex: 1, contactIds: ["son"] })
  })

  it("does not repeat a step that was already sent", () => {
    expect(at(3, 2)).toEqual({ type: "wait", untilMs: startedAtMs + 6 * MINUTE })
  })

  it("stops as soon as someone acknowledges", () => {
    expect(at(4, 2, true)).toEqual({ type: "stop" })
  })

  it("gives up after the last round", () => {
    expect(at(20, plan.steps.length)).toEqual({ type: "wait", untilMs: startedAtMs + 21 * MINUTE })
    expect(at(21, plan.steps.length)).toEqual({ type: "give-up", reason: "nobody-acknowledged" })
  })

  it("gives up straight away when there are no contacts", () => {
    const empty = buildEscalationPlan("critical", [])
    expect(nextEscalationAction({ plan: empty, startedAtMs, stepsSent: 0, acknowledged: false, nowMs: startedAtMs })).toEqual({
      type: "give-up",
      reason: "no-contacts",
    })
  })
})

describe("isFirstAlertFor", () => {
  it("is true only the first time a contact appears in the plan", () => {
    const plan = buildEscalationPlan("high", contacts) // daughter, son, then everyone x3
    expect(isFirstAlertFor(plan, 0, "daughter")).toBe(true)
    expect(isFirstAlertFor(plan, 1, "son")).toBe(true)
    expect(isFirstAlertFor(plan, 2, "daughter")).toBe(false)
    expect(isFirstAlertFor(plan, 2, "son")).toBe(false)
  })
})
