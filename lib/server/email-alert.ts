/*
 * email-alert.ts: emails an escalating incident to every contact subscribed
 * to the AWS SNS topic (the teammate's email layer in lib/aws/sns.ts).
 *
 * Why this file exists: the SNS layer only ran from the demo's "simulate
 * fall" button. This adapter lets real escalations from the safety monitor
 * send the same email, alongside the Telegram alerts. SNS sends one message
 * to the whole topic, so the email has no per-person "I'm handling it" link;
 * Telegram keeps doing that. Email is off unless AWS_SNS_TOPIC_ARN is set.
 */
import "server-only"

import { sendEmergencyAlert } from "@/lib/aws/sns"
import { getIncident } from "@/lib/safety/incidents"

import { alertText } from "./alert-message"
import type { IncidentRecord } from "./providers/store"

export function emailAlertsConfigured(): boolean {
  return Boolean(process.env.AWS_SNS_TOPIC_ARN?.trim())
}

export async function emailIncident(incident: IncidentRecord): Promise<void> {
  await sendEmergencyAlert({
    id: incident.id,
    type: getIncident(incident.incidentType).label,
    message: alertText(incident, { reminder: false }),
    occurredAt: new Date(incident.createdAtMs).toISOString(),
  })
}
