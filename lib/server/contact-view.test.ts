import { describe, expect, it, vi } from "vitest"

import { maskEmail, publicView } from "./contact-view"
import type { ContactRecord } from "./providers/store"

const contact: ContactRecord = {
  id: "c1",
  name: "Sara",
  priority: 1,
  inviteCode: "invite123",
  telegramChatId: null,
  email: "sara.ahmed@gmail.com",
  emailStatus: "pending",
}

describe("maskEmail", () => {
  it("keeps only the first character and the domain", () => {
    expect(maskEmail("sara.ahmed@gmail.com")).toBe("s****@gmail.com")
    expect(maskEmail("a@b.co")).toBe("a****@b.co")
  })

  it("hides malformed addresses completely", () => {
    expect(maskEmail("@gmail.com")).toBe("****")
    expect(maskEmail("nobody")).toBe("****")
  })
})

describe("publicView", () => {
  it("never returns the full email address or the chat ID", () => {
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "home_bot")
    const view = publicView({ ...contact, telegramChatId: "12345" })
    expect(JSON.stringify(view)).not.toContain("sara.ahmed")
    expect(JSON.stringify(view)).not.toContain("12345")
    vi.unstubAllEnvs()
  })

  it("returns the invite link only until the contact joins on Telegram", () => {
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "home_bot")
    expect(publicView(contact).inviteLink).toBe(
      "https://t.me/home_bot?start=invite123"
    )
    expect(
      publicView({ ...contact, telegramChatId: "12345" }).inviteLink
    ).toBeNull()
    vi.unstubAllEnvs()
  })
})
