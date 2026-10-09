// Tests for the Telegram webhook: secret check, and a reply button tap answering an alert.
import { beforeEach, describe, expect, it, vi } from "vitest"

import { encodeReply } from "@/lib/server/escalation-runner"
import { getStore } from "@/lib/server/providers/store"

import { POST } from "./route"

const SECRET = "w".repeat(64)
const telegram = vi.fn<(url: string, body: Record<string, unknown>) => void>()

function update(body: object, secret = SECRET) {
  return POST(
    new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": secret },
      body: JSON.stringify(body),
    })
  )
}

async function escalatingIncident() {
  const store = await getStore()
  const sara = await store.addContact({ name: "Sara", priority: 1 })
  await store.linkTelegramChat(sara.inviteCode, "1001")
  const incident = await store.createIncident({
    incidentType: "fall",
    severity: "high",
    language: "ar",
    confirmDeadlineMs: 0,
    triggerDescription: "طحت",
    transcript: null,
    classification: null,
  })
  await store.updateIncidentIf(
    incident.id,
    { status: ["confirming"] },
    { status: "escalating", escalationStartedAtMs: 0 }
  )
  return { store, incident }
}

describe("POST /api/telegram/webhook", () => {
  beforeEach(() => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET)
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:fake")
    vi.stubEnv("ACK_TOKEN_SECRET", "a".repeat(64))
    vi.stubEnv("NOTIFIER_PROVIDER", "")
    telegram.mockReset()
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        telegram(url, JSON.parse(String(init.body)))
        return Response.json({ ok: true })
      })
    )
  })

  it("rejects calls without Telegram's secret", async () => {
    expect((await update({}, "wrong")).status).toBe(401)
  })

  it("answers the alert when a contact taps On my way", async () => {
    const { store, incident } = await escalatingIncident()
    const response = await update({
      callback_query: {
        id: "cb-1",
        data: encodeReply("on-my-way", incident.id),
        message: { chat: { id: 1001 } },
      },
    })
    expect(response.status).toBe(200)
    expect(await store.getIncident(incident.id)).toMatchObject({
      status: "acknowledged",
      acknowledgedResponse: "on-my-way",
    })
    const methods = telegram.mock.calls.map(([url]) => url.split("/").at(-1))
    expect(methods).toEqual(
      expect.arrayContaining(["answerCallbackQuery", "sendMessage"])
    )
  })

  it("ignores taps from chats that are not contacts", async () => {
    const { store, incident } = await escalatingIncident()
    await update({
      callback_query: {
        id: "cb-2",
        data: encodeReply("calling", incident.id),
        message: { chat: { id: 999 } },
      },
    })
    expect((await store.getIncident(incident.id))?.status).toBe("escalating")
  })
})
