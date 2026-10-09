// Tests that the Supabase store sends the right queries. HTTP is captured; no database is used.
import { createClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import { createSupabaseStore } from "./store-supabase"

function capturingClient(responseRows: object[]) {
  const fetch = vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >(async () => Response.json(responseRows))
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false },
    global: { fetch },
  })
  return { store: createSupabaseStore(client), fetch }
}

const row = {
  id: "inc-1",
  incident_type: "fall",
  severity: "high",
  status: "escalating",
  language: "en",
  created_at_ms: "1000",
  confirm_deadline_ms: "2000",
  escalation_started_at_ms: "1500",
  escalation_reason: "asked-for-help",
  steps_sent: 2,
  trigger_description: "Thump, thud (91%)",
  transcript: null,
  classification: null,
  snippet_path: null,
  acknowledged_by_contact_id: null,
  acknowledged_at_ms: null,
}

describe("supabase store", () => {
  it("updates an incident only if its status and step still match", async () => {
    const { store, fetch } = capturingClient([row])
    const updated = await store.updateIncidentIf(
      "inc-1",
      { status: ["escalating"], stepsSent: 1 },
      { stepsSent: 2 }
    )

    const [input, init] = fetch.mock.calls[0]
    const url = new URL(String(input))
    expect(init?.method).toBe("PATCH")
    expect(url.pathname).toBe("/rest/v1/incidents")
    expect(url.searchParams.get("id")).toBe("eq.inc-1")
    expect(url.searchParams.get("status")).toBe("in.(escalating)")
    expect(url.searchParams.get("steps_sent")).toBe("eq.1")
    expect(JSON.parse(String(init?.body))).toEqual({ steps_sent: 2 })
    expect(updated).toMatchObject({
      id: "inc-1",
      stepsSent: 2,
      createdAtMs: 1000,
      escalationStartedAtMs: 1500,
    })
  })

  it("returns null when no row matched (another tick won)", async () => {
    const { store } = capturingClient([])
    expect(
      await store.updateIncidentIf(
        "inc-1",
        { status: ["confirming"] },
        { status: "cancelled" }
      )
    ).toBeNull()
  })

  it("refuses to write fields that have no column mapping", async () => {
    const { store } = capturingClient([row])
    await expect(
      store.updateIncidentIf(
        "inc-1",
        { status: ["escalating"] },
        { severity: "critical" }
      )
    ).rejects.toThrow("not supported")
  })

  it("still acknowledges on a database without the reply column", async () => {
    const fetch = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        Response.json(
          {
            code: "PGRST204",
            message:
              "Could not find the 'ack_response' column of 'incidents' in the schema cache",
          },
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(
        Response.json([{ ...row, status: "acknowledged" }])
      )
    const store = createSupabaseStore(
      createClient("https://example.supabase.co", "test-key", {
        auth: { persistSession: false },
        global: { fetch },
      })
    )
    const updated = await store.updateIncidentIf(
      "inc-1",
      { status: ["escalating"] },
      { status: "acknowledged", acknowledgedResponse: "on-my-way" }
    )
    expect(updated?.status).toBe("acknowledged")
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({
      status: "acknowledged",
    })
  })
})
