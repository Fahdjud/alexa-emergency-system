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
import type { ContactResponse } from "@/lib/safety/types"

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
    "Tap a button to answer. The others stop being alerted, and they hear it at home. / اضغط زرًا للرد.",
    `Emergency / الطوارئ: ${EMERGENCY_NUMBERS.unified} (ambulance / إسعاف ${EMERGENCY_NUMBERS.ambulance})`,
  ]
  return lines.filter((line) => line !== null).join("\n")
}

/** The reply buttons on an alert, in the order shown. */
export const RESPONSE_BUTTONS: Record<ContactResponse, string> = {
  "on-my-way": "🚗 On my way / في الطريق",
  calling: "📞 Calling now / أتصل الآن",
  handling: "✋ I'm handling it / سأتولى الأمر",
}

/** Told to the other contacts when someone answers. */
export function acknowledgedText(
  incident: IncidentRecord,
  contactName: string,
  response: ContactResponse = "handling"
): string {
  const alert = getIncident(incident.incidentType).label.toLowerCase()
  switch (response) {
    case "on-my-way":
      return `🚗 ${contactName} is on the way (${alert} alert). / ${contactName} في الطريق.`
    case "calling":
      return `📞 ${contactName} is calling them now (${alert} alert). / ${contactName} يتصل الآن.`
    case "handling":
      return `✅ ${contactName} is handling the ${alert} alert. / ${contactName} يتولى الأمر.`
  }
}

/** Sent back to the contact who tapped a reply button. */
export function responseReceivedText(response: ContactResponse): string {
  switch (response) {
    case "on-my-way":
      return "Thank you. They will hear that you are on the way, and the others have been told. / شكرًا، أبلغناهم أنك في الطريق."
    case "calling":
      return "Thank you. They will hear that you are calling; please call them now. / شكرًا، اتصل عليهم الآن."
    case "handling":
      return "Thank you. The others have been told you are handling it. / شكرًا، أبلغنا البقية."
  }
}

export function alreadyHandledText(contactName: string): string {
  return `${contactName} is already responding to this alert. / ${contactName} يتولى الأمر.`
}

export function alertClosedText(
  status: IncidentRecord["status"] | null
): string {
  return status === "cancelled"
    ? "They said they are fine. No action needed. / قال إنه بخير."
    : "This alert is no longer active. / هذا التنبيه لم يعد نشطًا."
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
