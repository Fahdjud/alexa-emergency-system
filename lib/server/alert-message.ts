/*
 * alert-message.ts: the text of every message sent to contacts, in English
 * and Arabic.
 *
 * Why this file exists: alerts are what family members actually read under
 * stress. Keeping the wording in one place of small pure functions makes it
 * easy to review, test and translate. No message ever diagnoses anything: it
 * says what was heard and what to do.
 */
import { getIncident } from "@/lib/safety/incidents"
import { EMERGENCY_NUMBERS } from "@/lib/safety/region"

import type { IncidentRecord } from "./providers/store"

export function alertText(
  incident: IncidentRecord,
  { reminder }: { reminder: boolean }
): string {
  const { label } = getIncident(incident.incidentType)
  const reason =
    incident.escalationReason === "asked-for-help"
      ? "They asked for help. / طلب المساعدة."
      : 'They did not answer "Are you okay?". / لم يرد على سؤال "هل أنت بخير؟".'
  const quote = incident.classification?.supportingQuote
  const lines = [
    `${reminder ? "🔁 Reminder / تذكير\n" : ""}🚨 ${label} at home / تنبيه في المنزل`,
    `Heard: ${incident.triggerDescription}`,
    quote ? `Said: “${quote}”` : null,
    reason,
    `Time: ${formatRiyadhTime(incident.createdAtMs)}`,
    "",
    "Tap the button if you are handling it, so others are not alerted. / اضغط الزر إذا كنت ستتولى الأمر.",
    `Emergency / الطوارئ: ${EMERGENCY_NUMBERS.unified} (ambulance / إسعاف ${EMERGENCY_NUMBERS.ambulance})`,
  ]
  return lines.filter((line) => line !== null).join("\n")
}

export function acknowledgedText(
  incident: IncidentRecord,
  contactName: string
): string {
  return `✅ ${contactName} is handling the ${getIncident(incident.incidentType).label.toLowerCase()} alert. / ${contactName} يتولى الأمر.`
}

export function unacknowledgedText(incident: IncidentRecord): string {
  return `⚠️ Nobody has acknowledged the ${getIncident(incident.incidentType).label.toLowerCase()} alert. Please check on them now or call ${EMERGENCY_NUMBERS.unified}. / لم يرد أحد. تواصل معه الآن أو اتصل على ${EMERGENCY_NUMBERS.unified}.`
}

/** Sent to contact 1 when the person said "I'm fine" but the incident type asks for a note (e.g. a smoke alarm). */
export function cancelledNoteText(incident: IncidentRecord): string {
  return `ℹ️ ${getIncident(incident.incidentType).label} at home at ${formatRiyadhTime(incident.createdAtMs)}. They said they are fine; no action needed. / قال إنه بخير.`
}

export function welcomeText(contactName: string): string {
  return `Hi ${contactName}. You are now an emergency contact. You will get a message here if something happens at home. / أهلًا ${contactName}. أصبحت جهة اتصال للطوارئ.`
}

function formatRiyadhTime(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(ms)
}

export function monitorOfflineText(lastSeenMs: number): string {
  return `⚠️ The home safety monitor has been offline since ${formatRiyadhTime(lastSeenMs)}. Nothing is listening until it is back: check the tablet or laptop (power, Wi-Fi, browser tab). / جهاز المراقبة متوقف. تحقق من الجهاز.`
}

export function monitorBackText(): string {
  return "✅ The home safety monitor is back online. / جهاز المراقبة يعمل مجددًا."
}
