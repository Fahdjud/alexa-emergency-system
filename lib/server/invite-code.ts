/*
 * invite-code.ts: creates the code in a contact's Telegram invite link
 * (t.me/<bot>?start=<code>).
 *
 * Why this file exists: both stores (memory and Supabase) create contacts, and
 * the code must be unguessable, because whoever opens the link becomes that
 * contact. Telegram start payloads allow A-Z a-z 0-9 _ - up to 64 characters.
 */
import "server-only"

import { randomBytes } from "node:crypto"

export function newInviteCode(): string {
  return randomBytes(12).toString("base64url")
}
