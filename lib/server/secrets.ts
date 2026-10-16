/*
 * Constant-time comparison for shared secrets (CRON_SECRET, the Telegram
 * webhook secret): SHA-256 digests compared with timingSafeEqual.
 */
import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"

export function secretsMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(sha256(presented), sha256(expected))
}

export function bearerToken(authorizationHeader: string | null): string {
  return authorizationHeader?.match(/^Bearer (.+)$/)?.[1] ?? ""
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest()
}
