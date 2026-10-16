// Tests for the contacts list: a contact with a confirmed email counts as connected, even without Telegram.
import { beforeEach, describe, expect, it, vi } from "vitest"

const confirmed = vi.fn<() => Promise<Set<string>>>()
vi.mock("@/lib/aws/sns", () => ({
  confirmedEmailSubscribers: () => confirmed(),
  subscribeTrustedContact: vi.fn(),
  publishEmail: vi.fn(),
  sendEmergencyAlert: vi.fn(),
}))

const { GET } = await import("./route")
const { forgetConfirmedEmails } = await import("@/lib/server/email-alert")
const { getStore } = await import("@/lib/server/providers/store")

async function list(): Promise<
  { name: string; connected: boolean; emailStatus: string | null }[]
> {
  const response = await GET()
  return (await response.json()).contacts
}

describe("GET /api/contacts", () => {
  beforeEach(() => {
    vi.stubEnv("AWS_SNS_TOPIC_ARN", "arn:aws:sns:us-east-1:123456789012:t")
    forgetConfirmedEmails()
    confirmed.mockReset()
  })

  it("shows a confirmed email as connected, without Telegram", async () => {
    const store = await getStore()
    const renad = await store.addContact({ name: "Renad", priority: 1 })
    await store.setContactEmail(renad.id, "renad@example.com", "pending")
    confirmed.mockResolvedValue(new Set(["renad@example.com"]))
    expect((await list()).find((c) => c.name === "Renad")).toMatchObject({
      connected: true,
      emailStatus: "confirmed",
    })
  })

  it("keeps waiting while AWS says the email is not confirmed", async () => {
    const store = await getStore()
    const omar = await store.addContact({ name: "Omar", priority: 2 })
    await store.setContactEmail(omar.id, "omar@example.com", "pending")
    confirmed.mockResolvedValue(new Set())
    expect((await list()).find((c) => c.name === "Omar")).toMatchObject({
      connected: false,
      emailStatus: "pending",
    })
  })

  it("never claims confirmed when AWS cannot be asked", async () => {
    const store = await getStore()
    const lina = await store.addContact({ name: "Lina", priority: 3 })
    await store.setContactEmail(lina.id, "lina@example.com", "pending")
    confirmed.mockRejectedValue(new Error("AccessDenied"))
    expect((await list()).find((c) => c.name === "Lina")).toMatchObject({
      connected: false,
      emailStatus: "pending",
    })
  })
})
