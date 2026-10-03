/*
 * store-memory.ts: an IncidentStore that keeps everything in this server
 * process's memory.
 *
 * Why this file exists: it lets escalation run and be tested locally with no
 * database. Data is lost on restart, and on Vercel each function instance has
 * its own memory, so production uses Supabase (STORE_PROVIDER=supabase).
 */
import "server-only"

import { randomUUID } from "node:crypto"

import type { MonitorStatus } from "@/lib/safety/monitor-health"
import { recordExpiresAtMs, snippetExpiresAtMs } from "@/lib/safety/retention"

import { newInviteCode } from "@/lib/server/invite-code"

import type { ContactRecord, IncidentRecord, IncidentStore } from "./store"

export function createMemoryStore(): IncidentStore {
  const contacts = new Map<string, ContactRecord>()
  const incidents = new Map<string, IncidentRecord>()
  const snippets = new Map<string, Blob>()
  let monitorStatus: MonitorStatus | null = null

  return {
    async listContacts() {
      return [...contacts.values()].sort((a, b) => a.priority - b.priority)
    },

    async addContact({ name, priority }) {
      const contact: ContactRecord = {
        id: randomUUID(),
        name,
        priority,
        telegramChatId: null,
        inviteCode: newInviteCode(),
      }
      contacts.set(contact.id, contact)
      return contact
    },

    async linkTelegramChat(inviteCode, chatId) {
      const contact = [...contacts.values()].find(
        (entry) => entry.inviteCode === inviteCode
      )
      if (!contact) return null
      const linked = { ...contact, telegramChatId: chatId }
      contacts.set(contact.id, linked)
      return linked
    },

    async createIncident(input) {
      const incident: IncidentRecord = {
        ...input,
        id: randomUUID(),
        status: "confirming",
        createdAtMs: Date.now(),
        escalationStartedAtMs: null,
        escalationReason: null,
        stepsSent: 0,
        snippetPath: null,
        acknowledgedByContactId: null,
        acknowledgedAtMs: null,
      }
      incidents.set(incident.id, incident)
      return incident
    },

    async getIncident(id) {
      return incidents.get(id) ?? null
    },

    async updateIncidentIf(id, when, patch) {
      const incident = incidents.get(id)
      if (!incident || !when.status.includes(incident.status)) return null
      if (when.stepsSent !== undefined && incident.stepsSent !== when.stepsSent)
        return null
      const updated = { ...incident, ...patch }
      incidents.set(id, updated)
      return updated
    },

    async listIncidentsByStatus(statuses) {
      return [...incidents.values()].filter((incident) =>
        statuses.includes(incident.status)
      )
    },

    async saveSnippet(incidentId, wav) {
      const path = `${incidentId}.wav`
      snippets.set(path, wav)
      return path
    },

    async getSnippet(path) {
      return snippets.get(path) ?? null
    },

    async getMonitorStatus() {
      return monitorStatus
    },

    async saveMonitorStatus(status) {
      monitorStatus = status
    },

    async deleteExpired(nowMs) {
      let deletedSnippets = 0
      let deletedIncidents = 0
      for (const incident of [...incidents.values()]) {
        const escalated = incident.escalationStartedAtMs !== null
        if (
          incident.snippetPath &&
          snippetExpiresAtMs({
            createdAtMs: incident.createdAtMs,
            escalated,
          }) <= nowMs
        ) {
          snippets.delete(incident.snippetPath)
          incidents.set(incident.id, { ...incident, snippetPath: null })
          deletedSnippets++
        }
        if (recordExpiresAtMs(incident) <= nowMs) {
          incidents.delete(incident.id)
          deletedIncidents++
        }
      }
      return { snippets: deletedSnippets, incidents: deletedIncidents }
    },
  }
}

/** One shared instance per server process; kept on globalThis so dev reloads do not wipe it. */
const holder = globalThis as typeof globalThis & {
  safetyMemoryStore?: IncidentStore
}
export const memoryStore = (holder.safetyMemoryStore ??= createMemoryStore())
