/*
 * monitor-machine.ts: the monitor page's states and how events move between
 * them, as a pure reducer (usable with React's useReducer).
 *
 *   idle -> listening -> [checking] -> confirming -> cancelled | escalated
 *                ^________________________________________|
 *
 * Why this file exists: the demo's VoiceState only covers a single
 * push-to-talk turn. The safety flow has more steps and safety rules that
 * must hold whatever the UI does:
 * - If the AI check fails, we still ask (fail safe).
 * - No answer within CONFIRMATION_TIMEOUT_MS escalates.
 * - An unclear answer does not cancel; we ask again until the deadline.
 * - While one incident is open, new triggers are ignored unless more severe.
 */
import {
  CONFIRMATION_TIMEOUT_MS,
  getIncident,
  SEVERITY_RANK,
} from "./incidents"
import type { IncidentTypeId, ReplyIntent, TriggerMatch } from "./types"

export type OpenIncident = {
  incidentId: IncidentTypeId
  trigger: TriggerMatch
  startedAtMs: number
}

export type MonitorState =
  | { phase: "idle" }
  | { phase: "listening" }
  | { phase: "checking"; incident: OpenIncident }
  | {
      phase: "confirming"
      incident: OpenIncident
      deadlineMs: number
      timesAsked: number
    }
  | { phase: "cancelled"; incident: OpenIncident; atMs: number }
  | {
      phase: "escalated"
      incident: OpenIncident
      atMs: number
      reason: "asked-for-help" | "no-answer"
    }

export type MonitorEvent =
  | { type: "start" }
  | { type: "stop" }
  | {
      type: "trigger"
      match: TriggerMatch
      needsAiCheck: boolean
      nowMs: number
    }
  | { type: "ai-check-done"; isIncident: boolean; nowMs: number }
  | { type: "ai-check-failed"; nowMs: number }
  | { type: "reply"; intent: ReplyIntent; nowMs: number }
  | { type: "tick"; nowMs: number }
  | { type: "resume" }

export const initialMonitorState: MonitorState = { phase: "idle" }

export function monitorReducer(
  state: MonitorState,
  event: MonitorEvent
): MonitorState {
  if (event.type === "stop") return { phase: "idle" }

  switch (state.phase) {
    case "idle":
      return event.type === "start" ? { phase: "listening" } : state

    case "listening":
      return event.type === "trigger" ? openIncident(event) : state

    case "checking":
      if (event.type === "trigger" && isMoreSevere(event.match, state.incident))
        return openIncident(event)
      if (event.type === "ai-check-done")
        return event.isIncident
          ? ask(state.incident, event.nowMs)
          : { phase: "listening" }
      if (event.type === "ai-check-failed")
        return ask(state.incident, event.nowMs)
      return state

    case "confirming":
      if (event.type === "trigger" && isMoreSevere(event.match, state.incident))
        return openIncident(event)
      if (event.type === "reply")
        return answer(state, event.intent, event.nowMs)
      if (event.type === "tick" && event.nowMs >= state.deadlineMs) {
        return {
          phase: "escalated",
          incident: state.incident,
          atMs: event.nowMs,
          reason: "no-answer",
        }
      }
      return state

    case "cancelled":
    case "escalated":
      return event.type === "resume" ? { phase: "listening" } : state
  }
}

function openIncident(
  event: Extract<MonitorEvent, { type: "trigger" }>
): MonitorState {
  const incident: OpenIncident = {
    incidentId: event.match.incidentId,
    trigger: event.match,
    startedAtMs: event.nowMs,
  }
  return event.needsAiCheck
    ? { phase: "checking", incident }
    : ask(incident, event.nowMs)
}

function ask(incident: OpenIncident, nowMs: number): MonitorState {
  return {
    phase: "confirming",
    incident,
    deadlineMs: nowMs + CONFIRMATION_TIMEOUT_MS,
    timesAsked: 1,
  }
}

function answer(
  state: Extract<MonitorState, { phase: "confirming" }>,
  intent: ReplyIntent,
  nowMs: number
): MonitorState {
  if (intent === "fine")
    return { phase: "cancelled", incident: state.incident, atMs: nowMs }
  if (intent === "help")
    return {
      phase: "escalated",
      incident: state.incident,
      atMs: nowMs,
      reason: "asked-for-help",
    }
  return { ...state, timesAsked: state.timesAsked + 1 } // unclear: ask again, deadline unchanged
}

function isMoreSevere(match: TriggerMatch, open: OpenIncident): boolean {
  return (
    SEVERITY_RANK[getIncident(match.incidentId).severity] <
    SEVERITY_RANK[getIncident(open.incidentId).severity]
  )
}

/**
 * Why a trigger would be ignored in this state, or null if it would be acted on.
 * Mirrors monitorReducer, so the screen can say why nothing happened instead of staying silent.
 */
export function whyTriggerIgnored(
  state: MonitorState,
  match: TriggerMatch
): string | null {
  switch (state.phase) {
    case "listening":
      return null
    case "idle":
      return "Not listening. Press Start listening."
    case "checking":
    case "confirming":
      return isMoreSevere(match, state.incident)
        ? null
        : `Already asking about: ${getIncident(state.incident.incidentId).label}`
    case "cancelled":
    case "escalated":
      return "Just finished an alert; listening again in a few seconds."
  }
}
