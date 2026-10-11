/*
 * Identifies practice alerts. A test is stored as an ordinary incident with
 * this exact trigger description, which avoids a schema change.
 */
import type { IncidentRecord } from "./providers/store"

export const TEST_TRIGGER_DESCRIPTION = "🧪 Test alert (system check)"

export function isTestIncident(
  incident: Pick<IncidentRecord, "triggerDescription">
): boolean {
  return incident.triggerDescription === TEST_TRIGGER_DESCRIPTION
}
