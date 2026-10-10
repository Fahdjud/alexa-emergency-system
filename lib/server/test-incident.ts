/*
 * test-incident.ts: how a test alert (from "Test the system") is recognised.
 *
 * Why this file exists: a test alert travels the same path as a real one
 * (Telegram buttons, email link, the answer spoken at home), so contacts can
 * practise. Every message about it must say TEST, and it must never
 * escalate. It is stored as an ordinary incident whose trigger description
 * is this exact marker, so no database change is needed.
 */
import type { IncidentRecord } from "./providers/store"

export const TEST_TRIGGER_DESCRIPTION = "🧪 Test alert (system check)"

export function isTestIncident(
  incident: Pick<IncidentRecord, "triggerDescription">
): boolean {
  return incident.triggerDescription === TEST_TRIGGER_DESCRIPTION
}
