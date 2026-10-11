/*
 * The public view of a contact returned to the monitor. Telegram chat IDs are
 * never exposed. A contact is "connected" when reachable on any channel:
 * Telegram, or an email address confirmed with AWS.
 */
import "server-only"

import type { ContactRecord } from "./providers/store"

export function publicView(
  contact: ContactRecord,
  confirmedEmails: Set<string> | null = null
) {
  const bot = process.env.TELEGRAM_BOT_USERNAME
  const telegramConnected = contact.telegramChatId !== null
  const emailStatus =
    contact.email && confirmedEmails?.has(contact.email.toLowerCase())
      ? ("confirmed" as const)
      : contact.emailStatus
  return {
    id: contact.id,
    name: contact.name,
    priority: contact.priority,
    connected: telegramConnected || emailStatus === "confirmed",
    telegramConnected,
    inviteLink: bot ? `https://t.me/${bot}?start=${contact.inviteCode}` : null,
    email: contact.email,
    emailStatus,
  }
}
