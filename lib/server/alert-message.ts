/*
 * The text of every message sent to contacts, in English and Arabic. Messages
 * describe what was heard and what to do; they never suggest a diagnosis.
 */
import { getIncident } from "@/lib/safety/incidents"
import { EMERGENCY_NUMBERS } from "@/lib/safety/region"
import type { ContactResponse } from "@/lib/safety/types"

import type { IncidentRecord } from "./providers/store"
import { isTestIncident } from "./test-incident"

export function alertText(
  incident: IncidentRecord,
  { reminder }: { reminder: boolean }
): string {
  return [
    `${reminder ? "🔁 Reminder / تذكير\n" : ""}${headline(incident)}`,
    ...details(incident),
    "",
    "Tap a button to answer. The others stop being alerted, and they hear it at home. / اضغط زرًا للرد.",
    emergencyLine(),
  ].join("\n")
}

/** Email subjects must be plain ASCII, under 100 characters. */
export function emailSubject(incident: IncidentRecord): string {
  return `Safety alert at home: ${getIncident(incident.incidentType).label}`
}

/** The email version: one link for everyone on the list instead of buttons. */
export function emailText(incident: IncidentRecord, answerUrl: string): string {
  return [
    headline(incident),
    ...details(incident),
    "",
    "Answer here (on my way, calling, or handling it). It stops the alerts to the others, and they hear it at home:",
    "رد من هنا (في الطريق، أتصل، أو سأتولى الأمر):",
    answerUrl,
    "",
    emergencyLine(),
    "",
    "This is an automated alert from the home safety monitor, not a medical diagnosis. / تنبيه آلي وليس تشخيصًا طبيًا.",
  ].join("\n")
}

function headline(incident: IncidentRecord): string {
  return `🚨 ${getIncident(incident.incidentType).label} at home / تنبيه في المنزل`
}

function details(incident: IncidentRecord): string[] {
  const reason =
    incident.escalationReason === "asked-for-help"
      ? "They asked for help. / طلب المساعدة."
      : 'They did not answer "Are you okay?". / لم يرد على سؤال "هل أنت بخير؟".'
  const quote = incident.classification?.supportingQuote
  return [
    `Heard: ${incident.triggerDescription}`,
    ...(quote ? [`Said: “${quote}”`] : []),
    reason,
    `Time: ${formatRiyadhTime(incident.createdAtMs)}`,
  ]
}

function emergencyLine(): string {
  return `Emergency / الطوارئ: ${EMERGENCY_NUMBERS.unified} (ambulance / إسعاف ${EMERGENCY_NUMBERS.ambulance})`
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
  const test = isTestIncident(incident)
  const alert = test
    ? "test"
    : getIncident(incident.incidentType).label.toLowerCase()
  const prefix = test ? "🧪 TEST · " : ""
  switch (response) {
    case "on-my-way":
      return `${prefix}🚗 ${contactName} is on the way (${alert} alert). / ${contactName} في الطريق.`
    case "calling":
      return `${prefix}📞 ${contactName} is calling them now (${alert} alert). / ${contactName} يتصل الآن.`
    case "handling":
      return `${prefix}✅ ${contactName} is handling the ${alert} alert. / ${contactName} يتولى الأمر.`
  }
}

/** The practice alert from "Test the system": clearly not an emergency, same buttons. */
export function testAlertText(): string {
  return [
    "🧪 TEST · تجربة",
    "This is a test of the home safety monitor. Nobody needs help.",
    "Please tap a button below to practise answering. The home will hear your answer.",
    "",
    "هذي تجربة لجهاز السلامة في البيت، ما أحد يحتاج مساعدة.",
    "اضغط أي زر تحت للتجربة، وبيسمعون ردك في البيت.",
  ].join("\n")
}

export const TEST_EMAIL_SUBJECT = "TEST: home safety monitor check"

export function testEmailText(answerUrl: string): string {
  return [
    "🧪 TEST · تجربة",
    "This is a test of the home safety monitor. Nobody needs help.",
    "To practise answering, open this link, pick your name and tap a button. The home will hear your answer:",
    "هذي تجربة، ما أحد يحتاج مساعدة. للتجربة افتح الرابط واختر اسمك واضغط زر:",
    answerUrl,
  ].join("\n")
}

/** Sent back to the contact who tapped a reply button. */
export function responseReceivedText(
  response: ContactResponse,
  { test }: { test: boolean } = { test: false }
): string {
  return `${test ? "🧪 TEST · " : ""}${responseText(response)}`
}

function responseText(response: ContactResponse): string {
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
