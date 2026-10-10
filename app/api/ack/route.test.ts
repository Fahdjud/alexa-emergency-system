// Tests for answering from the acknowledge page: personal links, and the email link that asks who is answering.
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ANY_CONTACT, signAckToken } from "@/lib/server/ack-token"
import { getStore } from "@/lib/server/providers/store"

import { POST } from "./route"

const SECRET = "s".repeat(64)

function answer(fields: Record<string, string>) {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  return POST(
    new Request("http://localhost/api/ack", { method: "POST", body: form })
  )
}

async function escalating() {
  const store = await getStore()
  const sara = await store.addContact({ name: "Sara", priority: 1 })
  const omar = await store.addContact({ name: "Omar", priority: 2 })
  const incident = await store.createIncident({
    incidentType: "fall",
    severity: "high",
    language: "en",
    confirmDeadlineMs: 0,
    triggerDescription: "Thump, thud 90%",
    transcript: null,
    classification: null,
  })
  await store.updateIncidentIf(
    incident.id,
    { status: ["confirming"] },
    { status: "escalating", escalationStartedAtMs: 0 }
  )
  const token = (contactId: string) =>
    signAckToken(
      { incidentId: incident.id, contactId, expiresAtMs: Date.now() + 60_000 },
      SECRET
    )
  return { store, sara, omar, incident, token }
}

describe("POST /api/ack", () => {
  beforeEach(() => {
    vi.stubEnv("ACK_TOKEN_SECRET", SECRET)
    vi.stubEnv("NOTIFIER_PROVIDER", "")
  })

  it("answers as the contact chosen on the page for an email link", async () => {
    const { store, omar, incident, token } = await escalating()
    const response = await answer({
      token: token(ANY_CONTACT),
      contact: omar.id,
      response: "on-my-way",
    })
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toContain(`as=${omar.id}`)
    expect(await store.getIncident(incident.id)).toMatchObject({
      status: "acknowledged",
      acknowledgedByContactId: omar.id,
      acknowledgedResponse: "on-my-way",
    })
  })

  it("needs a choice for an email link", async () => {
    const { store, incident, token } = await escalating()
    const response = await answer({
      token: token(ANY_CONTACT),
      response: "calling",
    })
    expect(response.status).toBe(400)
    expect((await store.getIncident(incident.id))?.status).toBe("escalating")
  })

  it("ignores a chosen contact on a personal link", async () => {
    const { store, sara, omar, incident, token } = await escalating()
    await answer({
      token: token(sara.id),
      contact: omar.id,
      response: "calling",
    })
    expect(
      (await store.getIncident(incident.id))?.acknowledgedByContactId
    ).toBe(sara.id)
  })

  it("rejects forged links", async () => {
    const { omar, incident } = await escalating()
    const forged = signAckToken(
      {
        incidentId: incident.id,
        contactId: ANY_CONTACT,
        expiresAtMs: Date.now() + 60_000,
      },
      "another-secret"
    )
    expect(
      (await answer({ token: forged, contact: omar.id, response: "calling" }))
        .status
    ).toBe(400)
  })
})
