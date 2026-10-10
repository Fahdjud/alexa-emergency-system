// Tests for the practice alert: marked TEST, one round only, answerable, refused during a real alert.
import { describe, expect, it } from "vitest"

import { verifyAckToken } from "./ack-token"
import {
  acknowledgeIncident,
  answerIncident,
  decodeReply,
  runEscalationTick,
  type EscalationDeps,
} from "./escalation-runner"
import type { Notifier, OutgoingMessage } from "./providers/notifier"
import { createMemoryStore } from "./providers/store-memory"
import { sendTestAlert, TEST_COOLDOWN_MS } from "./test-alert"

const SECRET = "test-ack-secret-test-ack-secret-test"
const NOW = Date.now() // the memory store stamps records with the real clock
const MINUTE = 60_000

async function setup() {
  const store = createMemoryStore()
  const sara = await store.addContact({ name: "Sara", priority: 1 })
  const omar = await store.addContact({ name: "Omar", priority: 2 })
  const sent: { to: string; message: OutgoingMessage }[] = []
  const notifier: Notifier = {
    canReach: () => true,
    async send(contact, message) {
      sent.push({ to: contact.name, message })
    },
  }
  const deps = (nowMs: number): EscalationDeps => ({
    store,
    notifier,
    nowMs,
    ackSecret: SECRET,
    baseUrl: "https://example.test",
  })
  return { store, sara, omar, sent, deps }
}

describe("sendTestAlert", () => {
  it("sends a TEST message with the reply buttons to every contact, once", async () => {
    const { store, sent, deps } = await setup()
    const result = await sendTestAlert(deps(NOW), "en")
    expect(result).toMatchObject({ ok: true, sentTo: ["Sara", "Omar"] })
    expect(sent).toHaveLength(2)
    expect(sent[0].message.text).toContain("TEST")
    expect(
      sent[0].message.replies?.map((r) => decodeReply(r.data)?.response)
    ).toEqual(["on-my-way", "calling", "handling"])

    const id = result.ok ? result.incidentId : ""
    expect((await store.getIncident(id))?.status).toBe("unacknowledged")
    await runEscalationTick(deps(NOW + 30 * MINUTE))
    expect(sent).toHaveLength(2) // never escalates or repeats
  })

  it("can be answered, and tells the others it was a test", async () => {
    const { store, sara, sent, deps } = await setup()
    const result = await sendTestAlert(deps(NOW), "ar")
    const id = result.ok ? result.incidentId : ""
    const answer = await acknowledgeIncident(
      deps(NOW + MINUTE),
      { incidentId: id, contactId: sara.id },
      "on-my-way"
    )
    expect(answer.outcome).toBe("acknowledged")
    expect(await store.getIncident(id)).toMatchObject({
      acknowledgedResponse: "on-my-way",
    })
    expect(sent.at(-1)).toMatchObject({
      to: "Omar",
      message: { text: expect.stringMatching(/TEST.*Sara is on the way/) },
    })
  })

  it("emails one TEST link for everyone when email is set up", async () => {
    const { deps } = await setup()
    const emails: { subject: string; text: string }[] = []
    await sendTestAlert(deps(NOW), "en", async (subject, text) => {
      emails.push({ subject, text })
    })
    expect(emails).toHaveLength(1)
    expect(emails[0].subject).toMatch(/^TEST/)
    const token = emails[0].text.match(/\/ack\/(\S+)/)?.[1] ?? ""
    expect(verifyAckToken(token, SECRET, NOW)?.contactId).toBe("any")
  })

  it("is refused while a real alert is open, and twice in a row", async () => {
    const { store, deps } = await setup()
    expect((await sendTestAlert(deps(NOW), "en")).ok).toBe(true)
    expect(await sendTestAlert(deps(NOW + 1000), "en")).toEqual({
      ok: false,
      reason: "too-soon",
    })
    expect(
      (await sendTestAlert(deps(NOW + TEST_COOLDOWN_MS + 5000), "en")).ok
    ).toBe(true)

    const real = await store.createIncident({
      incidentType: "fall",
      severity: "high",
      language: "en",
      confirmDeadlineMs: NOW + MINUTE,
      triggerDescription: "Thump, thud 90%",
      transcript: null,
      classification: null,
    })
    await answerIncident(deps(NOW), real.id, "help")
    expect(await sendTestAlert(deps(NOW + 5 * MINUTE), "en")).toEqual({
      ok: false,
      reason: "real-alert-active",
    })
  })
})
