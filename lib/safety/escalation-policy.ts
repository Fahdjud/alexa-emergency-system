/*
 * escalation-policy.ts: who to alert, and when, once an incident escalates.
 * Plain rules, no AI, no timers, no network.
 *
 * Why this file exists: the app has no backend, and escalation must keep going
 * when the browser tab closes. The server stores only "how many steps were
 * sent", and a scheduled tick asks nextEscalationAction() what to do now.
 * Because the answer depends only on its inputs, a missed or doubled tick
 * cannot skip or repeat an alert.
 *
 * Rules (approved):
 * - critical: alert every contact at once, then repeat every 2 minutes.
 * - high:     alert contacts one at a time, 3 minutes each.
 * - medium:   alert contacts one at a time, 5 minutes each.
 * - Then alert everyone together, 3 more times, 5 minutes apart
 *   (critical repeats every 2 minutes instead).
 * - Nobody acknowledged after that: give up, mark the incident
 *   "unacknowledged", and the device tells the person to call 911.
 * - The first acknowledgement stops everything.
 */
import type { Contact, Severity } from "./types"

const MINUTE = 60_000

type SeverityRule = { mode: "all-at-once" | "one-by-one"; waitMs: number }

export const ESCALATION_RULES: Record<Severity, SeverityRule> = {
  critical: { mode: "all-at-once", waitMs: 2 * MINUTE },
  high: { mode: "one-by-one", waitMs: 3 * MINUTE },
  medium: { mode: "one-by-one", waitMs: 5 * MINUTE },
}

/** After the first pass: alert everyone together this many more times. */
export const EVERYONE_ROUNDS = { count: 3, waitMs: 5 * MINUTE }

export type EscalationStep = {
  /** Milliseconds after escalation started. */
  offsetMs: number
  contactIds: string[]
}

export type EscalationPlan = {
  steps: EscalationStep[]
  /** Milliseconds after escalation started at which we stop and mark the incident unacknowledged. */
  giveUpAtMs: number
}

export type EscalationAction =
  | { type: "notify"; stepIndex: number; contactIds: string[] }
  | { type: "wait"; untilMs: number }
  | { type: "stop" }
  | { type: "give-up"; reason: "nobody-acknowledged" | "no-contacts" }

export function buildEscalationPlan(
  severity: Severity,
  contacts: Contact[]
): EscalationPlan {
  const ordered = [...contacts]
    .sort((a, b) => a.priority - b.priority)
    .map((contact) => contact.id)
  const rule = ESCALATION_RULES[severity]

  const firstPass: EscalationStep[] =
    rule.mode === "all-at-once"
      ? [{ offsetMs: 0, contactIds: ordered }]
      : ordered.map((id, index) => ({
          offsetMs: index * rule.waitMs,
          contactIds: [id],
        }))

  const firstPassEndMs = firstPass.length * rule.waitMs
  const repeatWaitMs =
    rule.mode === "all-at-once" ? rule.waitMs : EVERYONE_ROUNDS.waitMs
  const everyoneRounds: EscalationStep[] = Array.from(
    { length: EVERYONE_ROUNDS.count },
    (_, round) => ({
      offsetMs: firstPassEndMs + round * repeatWaitMs,
      contactIds: ordered,
    })
  )

  return {
    steps: [...firstPass, ...everyoneRounds],
    giveUpAtMs: firstPassEndMs + EVERYONE_ROUNDS.count * repeatWaitMs,
  }
}

export function nextEscalationAction(input: {
  plan: EscalationPlan
  startedAtMs: number
  /** How many steps of the plan have already been sent. */
  stepsSent: number
  acknowledged: boolean
  nowMs: number
}): EscalationAction {
  const { plan, startedAtMs, stepsSent, acknowledged, nowMs } = input
  if (acknowledged) return { type: "stop" }
  if (plan.steps.length === 0 || plan.steps[0].contactIds.length === 0)
    return { type: "give-up", reason: "no-contacts" }

  const nextStep = plan.steps[stepsSent]
  if (nextStep) {
    const dueMs = startedAtMs + nextStep.offsetMs
    return nowMs >= dueMs
      ? {
          type: "notify",
          stepIndex: stepsSent,
          contactIds: nextStep.contactIds,
        }
      : { type: "wait", untilMs: dueMs }
  }

  const giveUpMs = startedAtMs + plan.giveUpAtMs
  return nowMs >= giveUpMs
    ? { type: "give-up", reason: "nobody-acknowledged" }
    : { type: "wait", untilMs: giveUpMs }
}

/** True when this step is the first time the contact is alerted; later steps are reminders. */
export function isFirstAlertFor(
  plan: EscalationPlan,
  stepIndex: number,
  contactId: string
): boolean {
  return plan.steps
    .slice(0, stepIndex)
    .every((step) => !step.contactIds.includes(contactId))
}
