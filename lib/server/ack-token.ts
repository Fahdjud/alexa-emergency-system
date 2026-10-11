/*
 * Signed answer links for contacts. A token is "incidentId.contactId.expiry"
 * with an HMAC-SHA256 signature (ACK_TOKEN_SECRET), so it cannot be guessed or
 * forged and needs no database lookup to verify.
 */
import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Stands in for the contact in an email link. Email goes to every contact on
 * the topic at once, so the link names the incident only and the page asks
 * who is answering.
 */
export const ANY_CONTACT = "any"

/** Links keep working for a day, well past the longest escalation. */
export const ACK_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000

export type AckClaims = {
  incidentId: string
  contactId: string
  expiresAtMs: number
}

export function signAckToken(claims: AckClaims, secret: string): string {
  const payload = Buffer.from(
    `${claims.incidentId}.${claims.contactId}.${claims.expiresAtMs}`
  ).toString("base64url")
  return `${payload}.${signature(payload, secret)}`
}

/** Returns the claims for a genuine, unexpired token, otherwise null. */
export function verifyAckToken(
  token: string,
  secret: string,
  nowMs: number
): AckClaims | null {
  const [payload, givenSignature, extra] = token.split(".")
  if (!payload || !givenSignature || extra !== undefined) return null

  const expected = Buffer.from(signature(payload, secret))
  const given = Buffer.from(givenSignature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null

  const [incidentId, contactId, expiry] = Buffer.from(payload, "base64url")
    .toString("utf8")
    .split(".")
  const expiresAtMs = Number(expiry)
  if (
    !incidentId ||
    !contactId ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs < nowMs
  )
    return null
  return { incidentId, contactId, expiresAtMs }
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url")
}
