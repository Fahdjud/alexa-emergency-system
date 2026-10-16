// Tests for saving a contact's email: validation, and that the address is signed up, stored and returned masked.
import { beforeEach, describe, expect, it, vi } from "vitest"

const subscribe = vi.fn()
vi.mock("@/lib/aws/sns", () => ({
  subscribeTrustedContact: (email: string) => subscribe(email),
  confirmedEmailSubscribers: async () => new Set<string>(),
  sendEmergencyAlert: vi.fn(),
}))

const { PUT } = await import("./route")
const { getStore } = await import("@/lib/server/providers/store")

function put(id: string, body: unknown) {
  return PUT(
    new Request(`http://localhost/api/contacts/${id}/email`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  )
}

describe("PUT /api/contacts/[id]/email", () => {
  beforeEach(() => {
    vi.stubEnv("AWS_SNS_TOPIC_ARN", "arn:aws:sns:us-east-1:123456789012:t")
    subscribe.mockReset().mockResolvedValue({})
  })

  it("says so when email alerts are not set up", async () => {
    vi.stubEnv("AWS_SNS_TOPIC_ARN", "")
    expect((await put("any", { email: "a@b.co" })).status).toBe(503)
  })

  it("signs the address up and stores it on the contact", async () => {
    const store = await getStore()
    const sara = await store.addContact({ name: "Sara", priority: 1 })
    const response = await put(sara.id, { email: " Sara@Example.com " })
    expect(response.status).toBe(200)
    expect(subscribe).toHaveBeenCalledWith("sara@example.com")
    const { contact } = await response.json()
    expect(contact).toMatchObject({
      email: "s****@example.com",
      emailStatus: "pending",
    })
    expect(contact).not.toHaveProperty("telegramChatId")
  })

  it("keeps the address and reports a failed sign-up", async () => {
    const store = await getStore()
    const omar = await store.addContact({ name: "Omar", priority: 2 })
    subscribe.mockRejectedValue(new Error("AccessDenied"))
    const response = await put(omar.id, { email: "omar@example.com" })
    expect(response.status).toBe(502)
    expect((await response.json()).contact.emailStatus).toBe("failed")
  })

  it("rejects invalid addresses and unknown contacts", async () => {
    expect((await put("any", { email: "not-an-email" })).status).toBe(400)
    expect((await put("missing", { email: "a@b.co" })).status).toBe(404)
  })
})
