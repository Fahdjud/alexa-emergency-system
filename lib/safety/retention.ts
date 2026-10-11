/*
 * How long audio snippets and incident records are kept. The scheduled tick
 * deletes anything past these limits.
 *
 * The defaults follow common home-monitoring practice (event clips kept for
 * 30-60 days) and the data-minimisation principle of Saudi Arabia's PDPL:
 * - Cancelled or dismissed: audio kept 7 days, long enough to review false
 *   alarms and tune thresholds.
 * - Escalated: audio kept 30 days, so the family can review what happened.
 * - Incident records (type, times, transcript, who answered): 90 days.
 */

const DAY = 24 * 60 * 60 * 1000

export const RETENTION_DAYS = {
  snippetNotEscalated: 7,
  snippetEscalated: 30,
  incidentRecord: 90,
} as const

export function snippetExpiresAtMs(incident: {
  createdAtMs: number
  escalated: boolean
}): number {
  const days = incident.escalated
    ? RETENTION_DAYS.snippetEscalated
    : RETENTION_DAYS.snippetNotEscalated
  return incident.createdAtMs + days * DAY
}

export function recordExpiresAtMs(incident: { createdAtMs: number }): number {
  return incident.createdAtMs + RETENTION_DAYS.incidentRecord * DAY
}
