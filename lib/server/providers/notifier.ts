/*
 * notifier.ts: the Notifier interface and the factory that picks the
 * configured channel (NOTIFIER_PROVIDER).
 *
 * Why this file exists: the app had no way to reach anyone. Alerts go through
 * this interface, so Telegram can be swapped for SMS, WhatsApp or email by
 * adding one file. The console notifier lets everything run locally.
 */
import "server-only"

import type { ContactRecord } from "./store"
import { consoleNotifier } from "./notifier-console"
import { createTelegramNotifier } from "./notifier-telegram"

export type OutgoingMessage = {
  text: string
  /** Shown as a button. */
  action?: { label: string; url: string }
  /** The incident's audio snippet, attached when available. */
  audio?: Blob
}

export interface Notifier {
  /** Whether this contact can be reached on this channel at all. */
  canReach(contact: ContactRecord): boolean
  send(contact: ContactRecord, message: OutgoingMessage): Promise<void>
}

export function getNotifier(): Notifier {
  return process.env.NOTIFIER_PROVIDER === "telegram" ? createTelegramNotifier() : consoleNotifier
}
