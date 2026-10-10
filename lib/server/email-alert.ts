/*
 * email-alert.ts: emails an escalating incident to every contact subscribed
 * to the AWS SNS topic (the teammate's email layer in lib/aws/sns.ts).
 *
 * Why this file exists: the SNS layer only ran from the demo's "simulate
 * fall" button. This adapter lets real escalations from the safety monitor
 * send the same email, alongside the Telegram alerts, and lets the setup
 * screen sign a contact's email up to the topic. SNS sends one message to the
 * whole topic, so the email carries one answer link for the incident and the
 * page asks who is answering. Email is off unless AWS_SNS_TOPIC_ARN is set.
 */
import "server-only"

import { publishEmail, subscribeTrustedContact } from "@/lib/aws/sns"

import { emailSubject, emailText } from "./alert-message"
import type { IncidentRecord } from "./providers/store"

export function emailAlertsConfigured(): boolean {
  return Boolean(process.env.AWS_SNS_TOPIC_ARN?.trim())
}

/** answerUrl opens a page where whoever reads the email says who they are and answers. */
export async function emailIncident(
  incident: IncidentRecord,
  answerUrl: string
): Promise<void> {
  await publishEmail({
    subject: emailSubject(incident),
    message: emailText(incident, answerUrl),
  })
}

/**
 * Signs an address up to the SNS topic. AWS then emails them a link they must
 * click once before they receive alerts. Never throws: the result is saved as
 * the contact's email status.
 */
export async function signUpForEmail(
  email: string
): Promise<"pending" | "failed"> {
  try {
    await subscribeTrustedContact(email)
    return "pending"
  } catch (error) {
    console.error("Email sign-up failed", error)
    return "failed"
  }
}
