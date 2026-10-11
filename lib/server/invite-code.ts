/*
 * Random codes for Telegram invite links (t.me/<bot>?start=<code>). Opening a
 * link registers that chat as the contact, so codes must be unguessable.
 * Telegram allows A-Z a-z 0-9 _ - in start payloads.
 */
import "server-only"

import { randomBytes } from "node:crypto"

export function newInviteCode(): string {
  return randomBytes(12).toString("base64url")
}
