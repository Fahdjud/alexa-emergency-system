/*
 * notifier-console.ts: a Notifier that prints alerts to the server log.
 *
 * Why this file exists: escalation can be developed and tested without a
 * Telegram bot or real contacts. It is the default when NOTIFIER_PROVIDER is
 * empty.
 */
import "server-only"

import type { Notifier } from "./notifier"

export const consoleNotifier: Notifier = {
  canReach: () => true,
  async send(contact, message) {
    console.info(`[alert to ${contact.name}]`, message.text, message.action ? `\n[${message.action.label}] ${message.action.url}` : "")
  },
}
