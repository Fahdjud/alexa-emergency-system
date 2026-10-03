// Tests for heartbeats, the "monitor offline" message, and retention cleanup in the memory store.
import { describe, expect, it } from "vitest"

import { OFFLINE_AFTER_MS } from "@/lib/safety/monitor-health"

import type { EscalationDeps } from "./escalation-runner"
import { checkMonitorHealth, recordHeartbeat } from "./monitor-watch"
import type { Notifier } from "./providers/notifier"
import { createMemoryStore } from "./providers/store-memory"

const DAY = 24 * 60 * 60 * 1000

async function setup() {
  const store = createMemoryStore()
  await store.addContact({ name: "Sara", priority: 1 })
  await store.addContact({ name: "Omar", priority: 2 })
  const sent: { to: string; text: string }[] = []
  const notifier: Notifier = { canReach: () => true, send: async (contact, message) => void sent.push({ to: contact.name, text: message.text }) }
  const deps = (nowMs: number): EscalationDeps => ({ store, notifier, nowMs, ackSecret: "x".repeat(32), baseUrl: "https://example.test" })
  return { store, sent, deps }
}

describe("monitor watch", () => {
  it("tells contact 1 once when heartbeats stop, and again when they return", async () => {
    const { sent, deps } = await setup()
    await recordHeartbeat(deps(0), true)
    await checkMonitorHealth(deps(OFFLINE_AFTER_MS - 1))
    expect(sent).toHaveLength(0)

    await checkMonitorHealth(deps(OFFLINE_AFTER_MS))
    await checkMonitorHealth(deps(OFFLINE_AFTER_MS * 2))
    expect(sent).toEqual([{ to: "Sara", text: expect.stringContaining("offline") }])

    await recordHeartbeat(deps(OFFLINE_AFTER_MS * 3), true)
    expect(sent.at(-1)).toEqual({ to: "Sara", text: expect.stringContaining("back online") })
  })

  it("stays quiet after a deliberate stop", async () => {
    const { sent, deps } = await setup()
    await recordHeartbeat(deps(0), false)
    await checkMonitorHealth(deps(OFFLINE_AFTER_MS * 10))
    expect(sent).toHaveLength(0)
  })
})

describe("memory store retention", () => {
  it("deletes snippets after 7 or 30 days and records after 90", async () => {
    const { store } = await setup()
    const base = { severity: "high" as const, language: "en" as const, confirmDeadlineMs: 0, triggerDescription: "x", transcript: null, classification: null }
    const cancelled = await store.createIncident({ ...base, incidentType: "fall" })
    const escalated = await store.createIncident({ ...base, incidentType: "help_call" })
    for (const incident of [cancelled, escalated]) {
      await store.updateIncidentIf(incident.id, { status: ["confirming"] }, { snippetPath: await store.saveSnippet(incident.id, new Blob(["wav"])) })
    }
    await store.updateIncidentIf(escalated.id, { status: ["confirming"] }, { status: "escalating", escalationStartedAtMs: cancelled.createdAtMs })

    const at = (days: number) => cancelled.createdAtMs + days * DAY
    expect(await store.deleteExpired(at(6))).toEqual({ snippets: 0, incidents: 0 })
    expect(await store.deleteExpired(at(8))).toEqual({ snippets: 1, incidents: 0 })
    expect((await store.getIncident(cancelled.id))?.snippetPath).toBeNull()
    expect(await store.deleteExpired(at(31))).toEqual({ snippets: 1, incidents: 0 })
    expect(await store.deleteExpired(at(91))).toEqual({ snippets: 0, incidents: 2 })
  })
})
