/*
 * device-token.ts: checks the "Authorization: Bearer <MONITOR_DEVICE_TOKEN>"
 * header on requests from the monitor page.
 *
 * Why this file exists: the app had no API routes and no authentication. Every
 * safety API route (health check now, incidents and heartbeats later) needs
 * the same check, so it lives here once. Comparing SHA-256 digests with
 * timingSafeEqual avoids leaking the token through response timing.
 */
import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"

export function hasValidDeviceToken(authorizationHeader: string | null, expectedToken: string): boolean {
  const presented = authorizationHeader?.match(/^Bearer (.+)$/)?.[1]
  if (!presented) return false
  return timingSafeEqual(sha256(presented), sha256(expectedToken))
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest()
}
