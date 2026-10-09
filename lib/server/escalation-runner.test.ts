// Tests for escalation end to end: memory store, a recording notifier, a controllable clock.
import { describe, expect, it } from "vitest"

import { verifyAckToken } from "./ack-token"
import {
  acknowledgeIncident,
  answerIncident,
  decodeReply,
  encodeReply,
  runEscalationTick,
  type EscalationDeps,
} from "./escalation-runner"
import type { Notifier, OutgoingMessage } from "./providers/notifier"
import type { IncidentStore, NewIncident } from "./providers/store"
import { createMemoryStore } from "./providers/store-memory"

const MINUTE = 60_000
const SECRET = "test-ack-secret-test-ack-secret-test"
const START = 1_000_000_000

function recordingNotifier(unreachable: string[] = []) {
  const sent: { to: string; message: OutgoingMessage }[] = []
  const notifier: Notifier = {
    canReach: (contact) => !unreachable.includes(contact.name),
    async send(contact, message) {
      sent.push({ to: contact.name, message })
    },
  }
  return { notifier, sent }
}

async function setup(
  options: {
    unreachable?: string[]
    incident?: Partial<NewIncident>
    emailFails?: boolean
  } = {}
) {
  const store: IncidentStore = createMemoryStore()
  const daughter = await store.addContact({ name: "Daughter", priority: 1 })
  const son = await store.addContact({ name: "Son", priority: 2 })
  const incident = await store.createIncident({
    incidentType: "fall",
    severity: "high",
    language: "en",
    confirmDeadlineMs: START + 45_000,
    triggerDescription: "Thump, thud 92%",
    transcript: null,
    classification: null,
    ...options.incident,
  })
  const { notifier, sent } = recordingNotifier(options.unreachable)
  const emailed: string[] = []
  const deps = (nowMs: number): EscalationDeps => ({
    store,
    notifier,
    nowMs,
    ackSecret: SECRET,
    baseUrl: "https://example.test",
    emailAlert: async (escalating) => {
      if (options.emailFails) throw new Error("SNS is down")
      emailed.push(escalating.id)
    },
  })
  return { store, incident, daughter, son, sent, emailed, deps }
}

const tokenFrom = (url: string) => url.split("/ack/")[1]

describe("escalation", () => {
  it("alerts contacts one by one until someone acknowledges", async () => {
    const { store, incident, son, sent, deps } = await setup()
    await store.saveSnippet(incident.id, new Blob(["wav"]))
    await store.updateIncidentIf(
      incident.id,
      { status: ["confirming"] },
      { snippetPath: `${incident.id}.wav` }
    )

    await answerIncident(deps(START), incident.id, "help")
    expect(sent.map((s) => s.to)).toEqual(["Daughter"])
    expect(sent[0].message.text).toContain("They asked for help")
    expect(sent[0].message.audio).toBeInstanceOf(Blob)

    await runEscalationTick(deps(START + 1 * MINUTE))
    expect(sent).toHaveLength(1) // not due yet

    await runEscalationTick(deps(START + 3 * MINUTE))
    expect(sent.map((s) => s.to)).toEqual(["Daughter", "Son"])

    const sonToken = tokenFrom(sent[1].message.action!.url)
    const claims = verifyAckToken(sonToken, SECRET, START + 4 * MINUTE)!
    expect(claims.contactId).toBe(son.id)
    const acknowledged = await acknowledgeIncident(
      deps(START + 4 * MINUTE),
      claims
    )
    expect(acknowledged).toMatchObject({
      outcome: "acknowledged",
      incident: {
        status: "acknowledged",
        acknowledgedByContactId: son.id,
        acknowledgedResponse: "handling",
      },
    })
    expect(sent.at(-1)).toMatchObject({ to: "Daughter" })
    expect(sent.at(-1)!.message.text).toContain("Son is handling")

    const before = sent.length
    await runEscalationTick(deps(START + 30 * MINUTE))
    expect(sent).toHaveLength(before) // stopped
  })

  it("never sends the same step twice when ticks overlap", async () => {
    const { incident, sent, deps } = await setup()
    await answerIncident(deps(START), incident.id, "help")
    await Promise.all([
      runEscalationTick(deps(START + 3 * MINUTE)),
      runEscalationTick(deps(START + 3 * MINUTE)),
    ])
    expect(sent.map((s) => s.to)).toEqual(["Daughter", "Son"])
  })

  it("escalates on the server when the monitor never answers", async () => {
    const { store, incident, sent, deps } = await setup()
    await runEscalationTick(deps(START + 30_000))
    expect(sent).toHaveLength(0) // deadline not passed
    await runEscalationTick(deps(START + 46_000))
    expect((await store.getIncident(incident.id))?.escalationReason).toBe(
      "no-answer"
    )
    expect(sent[0].message.text).toContain("did not answer")
  })

  it("gives up after the last round and tells everyone", async () => {
    const { store, incident, sent, deps } = await setup()
    await answerIncident(deps(START), incident.id, "help")
    for (let minute = 1; minute <= 25; minute++)
      await runEscalationTick(deps(START + minute * MINUTE))
    expect((await store.getIncident(incident.id))?.status).toBe(
      "unacknowledged"
    )
    expect(
      sent
        .filter((s) => s.message.text.includes("Nobody has acknowledged"))
        .map((s) => s.to)
    ).toEqual(["Daughter", "Son"])
  })

  it("skips contacts who cannot be reached, and gives up if nobody can", async () => {
    const partly = await setup({ unreachable: ["Daughter"] })
    await answerIncident(partly.deps(START), partly.incident.id, "help")
    expect(partly.sent.map((s) => s.to)).toEqual(["Son"])

    const nobody = await setup({ unreachable: ["Daughter", "Son"] })
    await answerIncident(nobody.deps(START), nobody.incident.id, "help")
    await runEscalationTick(nobody.deps(START))
    expect((await nobody.store.getIncident(nobody.incident.id))?.status).toBe(
      "unacknowledged"
    )
  })

  it("cancels on 'fine', with a note to contact 1 only for incidents that ask for one", async () => {
    const fall = await setup()
    await answerIncident(fall.deps(START), fall.incident.id, "fine")
    expect((await fall.store.getIncident(fall.incident.id))?.status).toBe(
      "cancelled"
    )
    expect(fall.sent).toHaveLength(0)

    const alarm = await setup({
      incident: {
        incidentType: "smoke_co_alarm",
        severity: "critical",
        triggerDescription: "Smoke detector 88%",
      },
    })
    await answerIncident(alarm.deps(START), alarm.incident.id, "fine")
    expect(alarm.sent.map((s) => s.to)).toEqual(["Daughter"])
    expect(alarm.sent[0].message.text).toContain("They said they are fine")
  })

  it("alerts everyone at once for critical incidents", async () => {
    const { incident, sent, deps } = await setup({
      incident: { incidentType: "medical_distress", severity: "critical" },
    })
    await answerIncident(deps(START), incident.id, "no-answer")
    expect(sent.map((s) => s.to).sort()).toEqual(["Daughter", "Son"])
  })
})

describe("contact replies", () => {
  it("offers one-tap replies that name the incident", async () => {
    const { incident, sent, deps } = await setup()
    await answerIncident(deps(START), incident.id, "help")
    const data = sent[0].message.replies!.map((reply) => reply.data)
    expect(data.map(decodeReply)).toEqual([
      { response: "on-my-way", incidentId: incident.id },
      { response: "calling", incidentId: incident.id },
      { response: "handling", incidentId: incident.id },
    ])
    for (const value of data)
      expect(new TextEncoder().encode(value).length).toBeLessThanOrEqual(64)
  })

  it("stops the alerts and tells the others who is on the way", async () => {
    const { store, incident, daughter, son, sent, deps } = await setup({
      incident: { incidentType: "medical_distress", severity: "critical" },
    })
    await answerIncident(deps(START), incident.id, "help")
    const before = sent.length
    const result = await acknowledgeIncident(
      deps(START + MINUTE),
      { incidentId: incident.id, contactId: daughter.id },
      "on-my-way"
    )
    expect(result.outcome).toBe("acknowledged")
    expect(sent.slice(before)).toEqual([
      {
        to: "Son",
        message: { text: expect.stringContaining("Daughter is on the way") },
      },
    ])
    expect((await store.getIncident(incident.id))?.acknowledgedResponse).toBe(
      "on-my-way"
    )

    await runEscalationTick(deps(START + 10 * MINUTE))
    expect(sent).toHaveLength(before + 1) // no more alerts

    // The same contact can change their answer; someone else cannot take over.
    const changed = await acknowledgeIncident(
      deps(START + 2 * MINUTE),
      { incidentId: incident.id, contactId: daughter.id },
      "calling"
    )
    expect(changed.incident?.acknowledgedResponse).toBe("calling")
    expect(sent.at(-1)?.message.text).toContain("Daughter is calling them now")
    expect(
      await acknowledgeIncident(
        deps(START + 3 * MINUTE),
        { incidentId: incident.id, contactId: son.id },
        "on-my-way"
      )
    ).toMatchObject({ outcome: "already-handled", by: "Daughter" })
  })

  it("does not reopen an incident the person cancelled", async () => {
    const { incident, daughter, deps } = await setup()
    await answerIncident(deps(START), incident.id, "fine")
    expect(
      await acknowledgeIncident(
        deps(START),
        { incidentId: incident.id, contactId: daughter.id },
        "on-my-way"
      )
    ).toMatchObject({
      outcome: "not-active",
      incident: { status: "cancelled" },
    })
  })

  it("rejects malformed reply data", () => {
    expect(decodeReply(encodeReply("calling", "abc-123"))).toEqual({
      response: "calling",
      incidentId: "abc-123",
    })
    for (const bad of [
      "",
      "x:abc",
      "w:",
      "w:a:b",
      "w:../../etc",
      "w:" + "a".repeat(65),
    ])
      expect(decodeReply(bad), bad).toBeNull()
  })
})

describe("email alerts", () => {
  it("emails once when escalation starts, not on every step", async () => {
    const { incident, emailed, deps } = await setup()
    await answerIncident(deps(START), incident.id, "help")
    await runEscalationTick(deps(START + 3 * MINUTE))
    await runEscalationTick(deps(START + 6 * MINUTE))
    expect(emailed).toEqual([incident.id])
  })

  it("still alerts on Telegram when email fails", async () => {
    const { incident, sent, deps } = await setup({ emailFails: true })
    await answerIncident(deps(START), incident.id, "help")
    expect(sent.map((s) => s.to)).toEqual(["Daughter"])
  })

  it("sends no email when the person is fine", async () => {
    const { incident, emailed, deps } = await setup()
    await answerIncident(deps(START), incident.id, "fine")
    expect(emailed).toEqual([])
  })
})

describe("acknowledge tokens", () => {
  it("rejects tampered and expired tokens", async () => {
    const { incident, sent, deps } = await setup()
    await answerIncident(deps(START), incident.id, "help")
    const token = tokenFrom(sent[0].message.action!.url)
    expect(verifyAckToken(token, SECRET, START)).not.toBeNull()
    expect(verifyAckToken(token, "another-secret", START)).toBeNull()
    expect(verifyAckToken(`${token}x`, SECRET, START)).toBeNull()
    expect(verifyAckToken(token, SECRET, START + 25 * 60 * MINUTE)).toBeNull()
    expect(verifyAckToken("garbage", SECRET, START)).toBeNull()
  })
})
