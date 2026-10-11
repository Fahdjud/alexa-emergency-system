/*
 * Notifier interface and provider selection (NOTIFIER_PROVIDER). Another
 * channel (SMS, WhatsApp) can be added as one more implementation.
 */
import "server-only"

import type { ContactRecord } from "./store"
import { consoleNotifier } from "./notifier-console"
import { createTelegramNotifier } from "./notifier-telegram"

export type OutgoingMessage = {
  text: string
  /** Shown as a button. */
  action?: { label: string; url: string }
  /**
   * One-tap answers, for channels that support them (Telegram). The data is
   * sent back to us when tapped; such channels show these instead of `action`.
   */
  replies?: { label: string; data: string }[]
  /** The incident's audio snippet, attached when available. */
  audio?: Blob
}

export interface Notifier {
  /** Whether this contact can be reached on this channel at all. */
  canReach(contact: ContactRecord): boolean
  send(contact: ContactRecord, message: OutgoingMessage): Promise<void>
}

export function getNotifier(): Notifier {
  return process.env.NOTIFIER_PROVIDER === "telegram"
    ? createTelegramNotifier()
    : consoleNotifier
}
