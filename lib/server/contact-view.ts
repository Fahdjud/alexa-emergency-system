/*
 * contact-view.ts: what the monitor page may see of a contact.
 *
 * Why this file exists: two routes return contacts (the list, and saving an
 * email), and both must hide the same things. Telegram chat IDs are never
 * returned; the invite link is, so it can be shared. A contact counts as
 * connected when they can be alerted on any channel: Telegram, or an email
 * address they have confirmed with AWS.
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
