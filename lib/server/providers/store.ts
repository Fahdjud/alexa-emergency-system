/*
 * store.ts: the IncidentStore interface (contacts, incidents, alerts, audio
 * snippets) and the factory that picks the configured store (STORE_PROVIDER).
 *
 * Why this file exists: the app had no persistence. Escalation must survive
 * the browser tab closing, so its state lives on the server. Everything goes
 * through this interface, so the in-memory store (development) and Supabase
 * (production) are interchangeable.
 */
import "server-only"

import type { MonitorStatus } from "@/lib/safety/monitor-health"
import type { Classification } from "@/lib/safety/schemas"
import type { IncidentTypeId, Language, Severity } from "@/lib/safety/types"

import { memoryStore } from "./store-memory"

export type ContactRecord = {
  id: string
  name: string
  /** 1 is alerted first. */
  priority: number
  /** Set when the contact taps Start in the Telegram bot; until then they cannot be alerted. */
  telegramChatId: string | null
  /** Used in the t.me invite link that registers the contact's chat. */
  inviteCode: string
  /** Optional: alerts are also emailed here, through the AWS SNS topic. */
  email: string | null
  /**
   * "pending": signed up to the SNS topic; AWS has emailed them a link they must click once.
   * "failed": the sign-up call to AWS failed; saving the email again retries it.
   */
  emailStatus: EmailStatus | null
}

export type EmailStatus = "pending" | "failed"

export type IncidentStatus =
  | "confirming" // waiting for the person's answer
  | "cancelled" // the person said they are fine
  | "escalating" // alerting contacts
  | "acknowledged" // a contact said they are handling it
  | "unacknowledged" // nobody acknowledged after every round

export type IncidentRecord = {
  id: string
  incidentType: IncidentTypeId
  severity: Severity
  status: IncidentStatus
  language: Language
  createdAtMs: number
  /** If still "confirming" after this, the server escalates on its own (e.g. the tab crashed). */
  confirmDeadlineMs: number
  escalationStartedAtMs: number | null
  escalationReason: "asked-for-help" | "no-answer" | null
  /** How many steps of the escalation plan have been sent. */
  stepsSent: number
  /** "Thump, thud 92%" or the phrase heard. */
  triggerDescription: string
  transcript: string | null
  classification: Classification | null
  snippetPath: string | null
  acknowledgedByContactId: string | null
  acknowledgedAtMs: number | null
}

export type NewIncident = Pick<
  IncidentRecord,
  | "incidentType"
  | "severity"
  | "language"
  | "confirmDeadlineMs"
  | "triggerDescription"
  | "transcript"
  | "classification"
>

export type UpdateCondition = { status: IncidentStatus[]; stepsSent?: number }

export interface IncidentStore {
  listContacts(): Promise<ContactRecord[]>
  addContact(input: { name: string; priority: number }): Promise<ContactRecord>
  /** Sets or clears a contact's email address and sign-up status. Returns the contact, or null for an unknown id. */
  setContactEmail(
    id: string,
    email: string | null,
    status: EmailStatus | null
  ): Promise<ContactRecord | null>
  /** Links a Telegram chat to the contact with this invite code. Returns the contact, or null for an unknown code. */
  linkTelegramChat(
    inviteCode: string,
    chatId: string
  ): Promise<ContactRecord | null>

  createIncident(input: NewIncident): Promise<IncidentRecord>
  getIncident(id: string): Promise<IncidentRecord | null>
  /**
   * Applies the patch only if the incident still matches `when` (status, and stepsSent if given);
   * returns null otherwise. This is what stops two ticks escalating or alerting twice.
   */
  updateIncidentIf(
    id: string,
    when: UpdateCondition,
    patch: Partial<IncidentRecord>
  ): Promise<IncidentRecord | null>
  listIncidentsByStatus(statuses: IncidentStatus[]): Promise<IncidentRecord[]>

  saveSnippet(incidentId: string, wav: Blob): Promise<string>
  getSnippet(path: string): Promise<Blob | null>

  /** The household's monitor: last heartbeat and whether "offline" was reported. */
  getMonitorStatus(): Promise<MonitorStatus | null>
  saveMonitorStatus(status: MonitorStatus): Promise<void>

  /** Applies lib/safety/retention.ts: removes expired audio snippets and incident records. */
  deleteExpired(nowMs: number): Promise<{ snippets: number; incidents: number }>
}

/** Supabase in production; the in-memory store for local development and tests. */
export async function getStore(): Promise<IncidentStore> {
  if (process.env.STORE_PROVIDER === "supabase") {
    const { getSupabaseStore } = await import("./store-supabase")
    return getSupabaseStore()
  }
  return memoryStore
}
