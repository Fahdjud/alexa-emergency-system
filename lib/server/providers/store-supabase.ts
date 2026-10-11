/*
 * IncidentStore backed by Supabase: Postgres for contacts and incidents, a
 * private Storage bucket for snippets. Tables are created by db/schema.sql.
 * The service-role key is used only on the server.
 */
import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { MonitorStatus } from "@/lib/safety/monitor-health"
import {
  RETENTION_DAYS,
  recordExpiresAtMs,
  snippetExpiresAtMs,
} from "@/lib/safety/retention"
import { requireEnv } from "@/lib/server/env"
import { newInviteCode } from "@/lib/server/invite-code"

import type { ContactRecord, IncidentRecord, IncidentStore } from "./store"

const BUCKET = "incident-snippets"
const DAY_MS = 24 * 60 * 60 * 1000

type ContactRow = {
  id: string
  name: string
  priority: number
  telegram_chat_id: string | null
  invite_code: string
  email: string | null
  email_status: ContactRecord["emailStatus"]
}

type IncidentRow = {
  id: string
  incident_type: IncidentRecord["incidentType"]
  severity: IncidentRecord["severity"]
  status: IncidentRecord["status"]
  language: IncidentRecord["language"]
  created_at_ms: number
  confirm_deadline_ms: number
  escalation_started_at_ms: number | null
  escalation_reason: IncidentRecord["escalationReason"]
  steps_sent: number
  trigger_description: string
  transcript: string | null
  classification: IncidentRecord["classification"]
  snippet_path: string | null
  acknowledged_by_contact_id: string | null
  acknowledged_at_ms: number | null
  ack_response: IncidentRecord["acknowledgedResponse"]
}

let store: IncidentStore | null = null
export function getSupabaseStore(): IncidentStore {
  store ??= createSupabaseStore(
    createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    )
  )
  return store
}

export function createSupabaseStore(db: SupabaseClient): IncidentStore {
  return {
    async listContacts() {
      const { data, error } = await db
        .from("contacts")
        .select()
        .order("priority")
      check("list contacts", error)
      return (data as ContactRow[]).map(contactFromRow)
    },

    async addContact({ name, priority }) {
      const { data, error } = await db
        .from("contacts")
        .insert({ name, priority, invite_code: newInviteCode() })
        .select()
        .single()
      check("add contact", error)
      return contactFromRow(data as ContactRow)
    },

    async setContactEmail(id, email, emailStatus) {
      const { data, error } = await db
        .from("contacts")
        .update({ email, email_status: emailStatus })
        .eq("id", id)
        .select()
        .maybeSingle()
      check("save contact email", error)
      return data ? contactFromRow(data as ContactRow) : null
    },

    async linkTelegramChat(inviteCode, chatId) {
      const { data, error } = await db
        .from("contacts")
        .update({ telegram_chat_id: chatId })
        .eq("invite_code", inviteCode)
        .select()
        .maybeSingle()
      check("link Telegram chat", error)
      return data ? contactFromRow(data as ContactRow) : null
    },

    async createIncident(input) {
      const row = {
        incident_type: input.incidentType,
        severity: input.severity,
        status: "confirming",
        language: input.language,
        created_at_ms: Date.now(),
        confirm_deadline_ms: input.confirmDeadlineMs,
        trigger_description: input.triggerDescription,
        transcript: input.transcript,
        classification: input.classification,
      }
      const { data, error } = await db
        .from("incidents")
        .insert(row)
        .select()
        .single()
      check("create incident", error)
      return incidentFromRow(data as IncidentRow)
    },

    async getIncident(id) {
      const { data, error } = await db
        .from("incidents")
        .select()
        .eq("id", id)
        .maybeSingle()
      check("get incident", error)
      return data ? incidentFromRow(data as IncidentRow) : null
    },

    async updateIncidentIf(id, when, patch) {
      // One UPDATE ... WHERE: Postgres applies it atomically, so only one caller wins.
      const update = (row: Partial<IncidentRow>) => {
        let query = db
          .from("incidents")
          .update(row)
          .eq("id", id)
          .in("status", when.status)
        if (when.stepsSent !== undefined)
          query = query.eq("steps_sent", when.stepsSent)
        return query.select().maybeSingle()
      }
      const row = incidentPatchToRow(patch)
      let { data, error } = await update(row)
      // Databases created before ack_response was added lack the column;
      // the acknowledgement itself must still be saved.
      if (error?.message.includes("ack_response") && "ack_response" in row) {
        console.warn("Run db/schema.sql again to store contact replies.")
        const withoutReply = { ...row }
        delete withoutReply.ack_response
        ;({ data, error } = await update(withoutReply))
      }
      check("update incident", error)
      return data ? incidentFromRow(data as IncidentRow) : null
    },

    async listIncidentsByStatus(statuses) {
      const { data, error } = await db
        .from("incidents")
        .select()
        .in("status", statuses)
      check("list incidents", error)
      return (data as IncidentRow[]).map(incidentFromRow)
    },

    async saveSnippet(incidentId, wav) {
      const path = `${incidentId}.wav`
      const { error } = await db.storage
        .from(BUCKET)
        .upload(path, wav, { contentType: "audio/wav", upsert: true })
      check("save snippet", error)
      return path
    },

    async getSnippet(path) {
      const { data, error } = await db.storage.from(BUCKET).download(path)
      return error ? null : data
    },

    async getMonitorStatus() {
      const { data, error } = await db
        .from("monitor_status")
        .select()
        .eq("id", "home")
        .maybeSingle()
      check("get monitor status", error)
      if (!data) return null
      return {
        lastSeenMs: data.last_seen_ms,
        listening: data.listening,
        offlineAlertSentAtMs: data.offline_alert_sent_at_ms,
      }
    },

    async saveMonitorStatus(status: MonitorStatus) {
      const { error } = await db.from("monitor_status").upsert({
        id: "home",
        last_seen_ms: status.lastSeenMs,
        listening: status.listening,
        offline_alert_sent_at_ms: status.offlineAlertSentAtMs,
      })
      check("save monitor status", error)
    },

    async deleteExpired(nowMs) {
      // Only incidents old enough for the shortest rule can have anything expired.
      const oldest = nowMs - RETENTION_DAYS.snippetNotEscalated * DAY_MS
      const { data, error } = await db
        .from("incidents")
        .select("id, created_at_ms, escalation_started_at_ms, snippet_path")
        .lte("created_at_ms", oldest)
      check("find expired data", error)
      const rows = (data ?? []) as Pick<
        IncidentRow,
        "id" | "created_at_ms" | "escalation_started_at_ms" | "snippet_path"
      >[]

      const expiredSnippets = rows.filter(
        (row) =>
          row.snippet_path &&
          snippetExpiresAtMs({
            createdAtMs: row.created_at_ms,
            escalated: row.escalation_started_at_ms !== null,
          }) <= nowMs
      )
      const expiredRecords = rows.filter(
        (row) => recordExpiresAtMs({ createdAtMs: row.created_at_ms }) <= nowMs
      )

      if (expiredSnippets.length > 0) {
        const removed = await db.storage
          .from(BUCKET)
          .remove(expiredSnippets.map((row) => row.snippet_path as string))
        check("delete snippets", removed.error)
        const cleared = await db
          .from("incidents")
          .update({ snippet_path: null })
          .in(
            "id",
            expiredSnippets.map((row) => row.id)
          )
        check("clear snippet paths", cleared.error)
      }
      if (expiredRecords.length > 0) {
        const deleted = await db
          .from("incidents")
          .delete()
          .in(
            "id",
            expiredRecords.map((row) => row.id)
          )
        check("delete incidents", deleted.error)
      }
      return {
        snippets: expiredSnippets.length,
        incidents: expiredRecords.length,
      }
    },
  }
}

function check(operation: string, error: { message: string } | null): void {
  if (error)
    throw new Error(`Supabase: could not ${operation}: ${error.message}`)
}

function contactFromRow(row: ContactRow): ContactRecord {
  return {
    id: row.id,
    name: row.name,
    priority: row.priority,
    telegramChatId: row.telegram_chat_id,
    inviteCode: row.invite_code,
    email: row.email ?? null,
    emailStatus: row.email_status ?? null,
  }
}

function incidentFromRow(row: IncidentRow): IncidentRecord {
  return {
    id: row.id,
    incidentType: row.incident_type,
    severity: row.severity,
    status: row.status,
    language: row.language,
    createdAtMs: Number(row.created_at_ms),
    confirmDeadlineMs: Number(row.confirm_deadline_ms),
    escalationStartedAtMs:
      row.escalation_started_at_ms === null
        ? null
        : Number(row.escalation_started_at_ms),
    escalationReason: row.escalation_reason,
    stepsSent: row.steps_sent,
    triggerDescription: row.trigger_description,
    transcript: row.transcript,
    classification: row.classification,
    snippetPath: row.snippet_path,
    acknowledgedByContactId: row.acknowledged_by_contact_id,
    acknowledgedAtMs:
      row.acknowledged_at_ms === null ? null : Number(row.acknowledged_at_ms),
    acknowledgedResponse: row.ack_response ?? null,
  }
}

/** Maps only the fields present in the patch, so an update never overwrites other columns. */
function incidentPatchToRow(
  patch: Partial<IncidentRecord>
): Partial<IncidentRow> {
  const columns: { [K in keyof IncidentRecord]?: keyof IncidentRow } = {
    status: "status",
    escalationStartedAtMs: "escalation_started_at_ms",
    escalationReason: "escalation_reason",
    stepsSent: "steps_sent",
    snippetPath: "snippet_path",
    acknowledgedByContactId: "acknowledged_by_contact_id",
    acknowledgedAtMs: "acknowledged_at_ms",
    acknowledgedResponse: "ack_response",
    transcript: "transcript",
    classification: "classification",
  }
  const row: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(patch)) {
    const column = columns[field as keyof IncidentRecord]
    if (!column) throw new Error(`Updating ${field} is not supported`)
    row[column] = value
  }
  return row as Partial<IncidentRow>
}
