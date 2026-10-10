/*
 * test-alert.ts: sends a practice alert to every contact, for "Test the
 * system" on the monitor.
 *
 * Why this file exists: families should see an alert, and contacts should
 * try the reply buttons, before a real emergency. The test goes through the
 * same channels as a real alert (Telegram buttons, the email answer link,
 * the answer spoken at home), but every message says TEST, and it is stored
 * as already "unacknowledged" so the escalation never picks it up: one
 * round, no reminders, nothing repeated.
 */
import "server-only"

import type { Language } from "@/lib/safety/types"

import { ANY_CONTACT } from "./ack-token"
import {
  RESPONSE_BUTTONS,
  TEST_EMAIL_SUBJECT,
  testAlertText,
  testEmailText,
} from "./alert-message"
import { ackUrl, encodeReply, type EscalationDeps } from "./escalation-runner"
import { TEST_TRIGGER_DESCRIPTION, isTestIncident } from "./test-incident"

/** One test at a time: a second press within this window is refused. */
export const TEST_COOLDOWN_MS = 30_000

export type TestAlertResult =
  | { ok: true; incidentId: string; sentTo: string[]; emailed: boolean }
  | { ok: false; reason: "real-alert-active" | "too-soon" }

export async function sendTestAlert(
  deps: EscalationDeps,
  language: Language,
  /** Sends one email to everyone on the list, when email alerts are set up. */
  email?: (subject: string, text: string) => Promise<void>
): Promise<TestAlertResult> {
  const open = await deps.store.listIncidentsByStatus([
    "confirming",
    "escalating",
  ])
  if (open.some((incident) => !isTestIncident(incident)))
    return { ok: false, reason: "real-alert-active" }
  const recent = await deps.store.listIncidentsByStatus([
    "unacknowledged",
    "acknowledged",
  ])
  if (
    recent.some(
      (incident) =>
        isTestIncident(incident) &&
        deps.nowMs - incident.createdAtMs < TEST_COOLDOWN_MS
    )
  )
    return { ok: false, reason: "too-soon" }

  const created = await deps.store.createIncident({
    incidentType: "fall",
    severity: "medium",
    language,
    // Far in the future, so no tick can escalate it before it is closed below.
    confirmDeadlineMs: deps.nowMs + 60 * 60 * 1000,
    triggerDescription: TEST_TRIGGER_DESCRIPTION,
    transcript: null,
    classification: null,
  })
  // "unacknowledged" never escalates, but can still be answered.
  const incident =
    (await deps.store.updateIncidentIf(
      created.id,
      { status: ["confirming"] },
      { status: "unacknowledged" }
    )) ?? created

  const contacts = (await deps.store.listContacts()).filter((contact) =>
    deps.notifier.canReach(contact)
  )
  const sent = await Promise.all(
    contacts.map((contact) =>
      deps.notifier
        .send(contact, {
          text: testAlertText(),
          action: {
            label: RESPONSE_BUTTONS.handling,
            url: ackUrl(deps, incident.id, contact.id),
          },
          replies: (["on-my-way", "calling", "handling"] as const).map(
            (response) => ({
              label: RESPONSE_BUTTONS[response],
              data: encodeReply(response, incident.id),
            })
          ),
        })
        .then(() => contact.name)
        .catch((error) => {
          console.error(`Test alert to ${contact.name} failed`, error)
          return null
        })
    )
  )

  let emailed = false
  if (email) {
    emailed = await email(
      TEST_EMAIL_SUBJECT,
      testEmailText(ackUrl(deps, incident.id, ANY_CONTACT))
    )
      .then(() => true)
      .catch((error) => {
        console.error("Test email failed", error)
        return false
      })
  }

  return {
    ok: true,
    incidentId: incident.id,
    sentTo: sent.filter((name): name is string => name !== null),
    emailed,
  }
}
