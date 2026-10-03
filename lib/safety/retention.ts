/*
 * retention.ts: how long incident audio snippets and records are kept.
 *
 * Why this file exists: the app stores nothing today. The safety assistant
 * stores short audio snippets of people at home, so keeping them only as long
 * as they are useful must be a deliberate, visible rule. The daily cleanup
 * (part of the scheduled tick) uses these functions.
 *
 * Choices, benchmarked against consumer home-monitoring products (event clips
 * typically kept 30-60 days by default) and Saudi Arabia's PDPL, which asks
 * that personal data be kept no longer than needed:
 * - Cancelled ("I'm fine") or dismissed: the audio has no further use. 7 days
 *   leaves time to review false alarms and tune thresholds.
 * - Escalated: 30 days, enough for the family to review what happened.
 * - Incident records (type, times, transcript, who acknowledged): 90 days.
 */

const DAY = 24 * 60 * 60 * 1000

export const RETENTION_DAYS = {
  snippetNotEscalated: 7,
  snippetEscalated: 30,
  incidentRecord: 90,
} as const

export function snippetExpiresAtMs(incident: { createdAtMs: number; escalated: boolean }): number {
  const days = incident.escalated ? RETENTION_DAYS.snippetEscalated : RETENTION_DAYS.snippetNotEscalated
  return incident.createdAtMs + days * DAY
}

export function recordExpiresAtMs(incident: { createdAtMs: number }): number {
  return incident.createdAtMs + RETENTION_DAYS.incidentRecord * DAY
}
