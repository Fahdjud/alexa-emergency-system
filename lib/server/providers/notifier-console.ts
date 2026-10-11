/*
 * A notifier that logs alerts instead of sending them. Default when
 * NOTIFIER_PROVIDER is not set.
 */
import "server-only"

import type { Notifier } from "./notifier"

export const consoleNotifier: Notifier = {
  canReach: () => true,
  async send(contact, message) {
    console.info(
      `[alert to ${contact.name}]`,
      message.text,
      message.action ? `\n[${message.action.label}] ${message.action.url}` : "",
      message.replies
        ? `\n${message.replies.map((reply) => `[${reply.label}]`).join(" ")}`
        : ""
    )
  },
}
