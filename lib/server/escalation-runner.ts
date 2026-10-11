/*
 * Applies the escalation policy to stored incidents and sends the alerts. It
 * runs on every scheduler tick and immediately when someone asks for help.
 * All effects go through the injected store and notifier.
 *
 * Each step is claimed with a conditional update on stepsSent before it is
 * sent, so overlapping ticks cannot alert twice. If the server dies mid-send,
 * that step is lost, but the later rounds to everyone still reach every
 * contact.
 */
import "server-only"

import {
  buildEscalationPlan,
  isFirstAlertFor,
  nextEscalationAction,
} from "@/lib/safety/escalation-policy"
import { getIncident } from "@/lib/safety/incidents"
import { CONTACT_RESPONSES, type ContactResponse } from "@/lib/safety/types"

import { ACK_TOKEN_LIFETIME_MS, ANY_CONTACT, signAckToken } from "./ack-token"
import {
  acknowledgedText,
  alertText,
  cancelledNoteText,
  RESPONSE_BUTTONS,
  unacknowledgedText,
} from "./alert-message"
import type { Notifier, OutgoingMessage } from "./providers/notifier"
import type {
  ContactRecord,
  IncidentRecord,
  IncidentStore,
} from "./providers/store"

export type EscalationDeps = {
  store: IncidentStore
  notifier: Notifier
  nowMs: number
  ackSecret: string
  baseUrl: string
  /** Optional second channel: emails the incident once, when the first alerts go out, with an answer link. */
  emailAlert?: (incident: IncidentRecord, answerUrl: string) => Promise<void>
}

export type Answer = "fine" | "help" | "no-answer"

/** The person's answer from the monitor page (or "no-answer" when their 30 s ran out). */
export async function answerIncident(
  deps: EscalationDeps,
  incidentId: string,
  answer: Answer
): Promise<IncidentRecord | null> {
  if (answer === "fine") {
    const cancelled = await deps.store.updateIncidentIf(
      incidentId,
      { status: ["confirming"] },
      { status: "cancelled" }
    )
    if (cancelled && getIncident(cancelled.incidentType).notifyOnCancel)
      await sendCancelledNote(deps, cancelled)
    return cancelled ?? deps.store.getIncident(incidentId)
  }
  return startEscalation(
    deps,
    incidentId,
    answer === "help" ? "asked-for-help" : "no-answer"
  )
}

async function startEscalation(
  deps: EscalationDeps,
  incidentId: string,
  reason: NonNullable<IncidentRecord["escalationReason"]>
): Promise<IncidentRecord | null> {
  const started = await deps.store.updateIncidentIf(
    incidentId,
    { status: ["confirming"] },
    {
      status: "escalating",
      escalationStartedAtMs: deps.nowMs,
      escalationReason: reason,
    }
  )
  if (!started) return deps.store.getIncident(incidentId) // already escalating, cancelled or acknowledged
  return advanceEscalation(deps, started)
}

/** Sends the next due step, or gives up after the last round. Idempotent. */
async function advanceEscalation(
  deps: EscalationDeps,
  incident: IncidentRecord
): Promise<IncidentRecord | null> {
  if (
    incident.status !== "escalating" ||
    incident.escalationStartedAtMs === null
  )
    return incident

  const contacts = (await deps.store.listContacts()).filter((contact) =>
    deps.notifier.canReach(contact)
  )
  const plan = buildEscalationPlan(incident.severity, contacts)
  const action = nextEscalationAction({
    plan,
    startedAtMs: incident.escalationStartedAtMs,
    stepsSent: incident.stepsSent,
    acknowledged: false,
    nowMs: deps.nowMs,
  })

  if (action.type === "notify") {
    const step = action.stepIndex
    const claimed = await deps.store.updateIncidentIf(
      incident.id,
      { status: ["escalating"], stepsSent: step },
      { stepsSent: step + 1 }
    )
    if (!claimed) return deps.store.getIncident(incident.id) // another tick sent it, or it was acknowledged

    if (step === 0 && deps.emailAlert)
      await deps
        .emailAlert(claimed, ackUrl(deps, incident.id, ANY_CONTACT))
        .catch((error) => console.error("Email alert failed", error))

    const audio = incident.snippetPath
      ? await deps.store.getSnippet(incident.snippetPath)
      : null
    await sendToEach(
      deps,
      contacts.filter((contact) => action.contactIds.includes(contact.id)),
      (contact) => {
        const firstAlert = isFirstAlertFor(plan, step, contact.id)
        return {
          text: alertText(incident, { reminder: !firstAlert }),
          action: {
            label: "I'm handling it / سأتولى الأمر",
            url: ackUrl(deps, incident.id, contact.id),
          },
          replies: CONTACT_RESPONSES_IN_BUTTON_ORDER.map((response) => ({
            label: RESPONSE_BUTTONS[response],
            data: encodeReply(response, incident.id),
          })),
          audio: firstAlert && audio ? audio : undefined,
        }
      }
    )
    return claimed
  }

  if (action.type === "give-up") {
    const givenUp = await deps.store.updateIncidentIf(
      incident.id,
      { status: ["escalating"] },
      { status: "unacknowledged" }
    )
    if (givenUp)
      await sendToEach(deps, contacts, () => ({
        text: unacknowledgedText(givenUp),
      }))
    return givenUp
  }

  return incident // wait, or stopped
}

export type AckResult =
  | { outcome: "acknowledged"; incident: IncidentRecord }
  /** Someone else answered first; their name is given. */
  | { outcome: "already-handled"; incident: IncidentRecord; by: string }
  /** Cancelled, still being confirmed, or gone. */
  | { outcome: "not-active"; incident: IncidentRecord | null }

/**
 * A contact answered an alert ("on my way", "calling", "I'm handling it").
 * The first answer stops the escalation and tells the others; the same
 * contact may change their answer later (on the way, then calling).
 */
export async function acknowledgeIncident(
  deps: EscalationDeps,
  { incidentId, contactId }: { incidentId: string; contactId: string },
  response: ContactResponse = "handling"
): Promise<AckResult> {
  const contacts = await deps.store.listContacts()
  const contact = contacts.find((entry) => entry.id === contactId)
  if (!contact) return { outcome: "not-active", incident: null }
  const tellOthers = (incident: IncidentRecord) =>
    sendToEach(
      deps,
      contacts.filter(
        (entry) => entry.id !== contact.id && deps.notifier.canReach(entry)
      ),
      () => ({ text: acknowledgedText(incident, contact.name, response) })
    )

  const acknowledged = await deps.store.updateIncidentIf(
    incidentId,
    { status: ["escalating", "unacknowledged"] },
    {
      status: "acknowledged",
      acknowledgedByContactId: contact.id,
      acknowledgedAtMs: deps.nowMs,
      acknowledgedResponse: response,
    }
  )
  if (acknowledged) {
    await tellOthers(acknowledged)
    return { outcome: "acknowledged", incident: acknowledged }
  }

  const current = await deps.store.getIncident(incidentId)
  if (current?.status !== "acknowledged")
    return { outcome: "not-active", incident: current }
  if (current.acknowledgedByContactId !== contact.id)
    return {
      outcome: "already-handled",
      incident: current,
      by:
        contacts.find((entry) => entry.id === current.acknowledgedByContactId)
          ?.name ?? "Someone",
    }
  if (current.acknowledgedResponse === response)
    return { outcome: "acknowledged", incident: current }

  const changed = await deps.store.updateIncidentIf(
    incidentId,
    { status: ["acknowledged"] },
    { acknowledgedResponse: response }
  )
  if (changed) await tellOthers(changed)
  return { outcome: "acknowledged", incident: changed ?? current }
}

const CONTACT_RESPONSES_IN_BUTTON_ORDER: ContactResponse[] = [
  "on-my-way",
  "calling",
  "handling",
]

const REPLY_CODES: Record<ContactResponse, string> = {
  handling: "h",
  "on-my-way": "w",
  calling: "c",
}

/** Button data for a reply: "w:<incident id>". Telegram allows 64 bytes. */
export function encodeReply(
  response: ContactResponse,
  incidentId: string
): string {
  return `${REPLY_CODES[response]}:${incidentId}`
}

export function decodeReply(
  data: string
): { response: ContactResponse; incidentId: string } | null {
  const [code, incidentId, extra] = data.split(":")
  const response = CONTACT_RESPONSES.find(
    (candidate) => REPLY_CODES[candidate] === code
  )
  if (!response || !incidentId || extra !== undefined) return null
  if (!/^[A-Za-z0-9-]{1,64}$/.test(incidentId)) return null
  return { response, incidentId }
}

/** One scheduled pass: escalate unanswered questions (e.g. the tab crashed), then advance every escalation. */
export async function runEscalationTick(
  deps: EscalationDeps
): Promise<{ escalated: number; advanced: number }> {
  const unanswered = (
    await deps.store.listIncidentsByStatus(["confirming"])
  ).filter((incident) => incident.confirmDeadlineMs <= deps.nowMs)
  for (const incident of unanswered)
    await startEscalation(deps, incident.id, "no-answer")

  const escalating = await deps.store.listIncidentsByStatus(["escalating"])
  for (const incident of escalating) await advanceEscalation(deps, incident)
  return { escalated: unanswered.length, advanced: escalating.length }
}

async function sendCancelledNote(
  deps: EscalationDeps,
  incident: IncidentRecord
) {
  const first = (await deps.store.listContacts()).find((contact) =>
    deps.notifier.canReach(contact)
  )
  if (first)
    await sendToEach(deps, [first], () => ({
      text: cancelledNoteText(incident),
    }))
}

/** One failing contact must not stop the others from being alerted. */
async function sendToEach(
  deps: EscalationDeps,
  contacts: ContactRecord[],
  message: (contact: ContactRecord) => OutgoingMessage
) {
  await Promise.all(
    contacts.map((contact) =>
      deps.notifier
        .send(contact, message(contact))
        .catch((error) =>
          console.error(`Alert to ${contact.name} failed`, error)
        )
    )
  )
}

/** A signed link to the answer page; contactId ANY_CONTACT for email (the page asks who is answering). */
export function ackUrl(
  deps: EscalationDeps,
  incidentId: string,
  contactId: string
): string {
  const token = signAckToken(
    { incidentId, contactId, expiresAtMs: deps.nowMs + ACK_TOKEN_LIFETIME_MS },
    deps.ackSecret
  )
  return `${deps.baseUrl}/ack/${token}`
}
