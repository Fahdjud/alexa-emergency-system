/*
 * contact-view.ts: what the monitor page may see of a contact.
 *
 * Why this file exists: two routes return contacts (the list, and saving an
 * email), and both must hide the same things. Telegram chat IDs are never
 * returned; the invite link is, so it can be shared.
 */
import "server-only"

import type { ContactRecord } from "./providers/store"

export function publicView(contact: ContactRecord) {
  const bot = process.env.TELEGRAM_BOT_USERNAME
  return {
    id: contact.id,
    name: contact.name,
    priority: contact.priority,
    connected: contact.telegramChatId !== null,
    inviteLink: bot ? `https://t.me/${bot}?start=${contact.inviteCode}` : null,
    email: contact.email,
    emailStatus: contact.emailStatus,
  }
}
