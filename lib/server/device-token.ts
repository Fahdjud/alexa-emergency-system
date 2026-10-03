/*
 * device-token.ts: checks the "Authorization: Bearer <MONITOR_DEVICE_TOKEN>"
 * header on requests from the monitor page.
 *
 * Why this file exists: the app had no API routes and no authentication. Every
 * safety API route needs the same check, so it lives here once, along with
 * the constant-time comparison used for the other shared secrets. Comparing SHA-256 digests with
 * timingSafeEqual avoids leaking the token through response timing.
 */
import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"

import { getMonitorDeviceToken } from "./env"

export function hasValidDeviceToken(
  authorizationHeader: string | null,
  expectedToken: string
): boolean {
  const presented = bearerToken(authorizationHeader)
  return presented !== "" && secretsMatch(presented, expectedToken)
}

/** Constant-time comparison for any shared secret (device token, CRON_SECRET, Telegram webhook secret). */
export function secretsMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(sha256(presented), sha256(expected))
}

export function bearerToken(authorizationHeader: string | null): string {
  return authorizationHeader?.match(/^Bearer (.+)$/)?.[1] ?? ""
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest()
}

/** For API routes: returns an error response unless the request carries the household's device token. */
export function rejectUnlessDevice(request: Request): Response | null {
  const expectedToken = getMonitorDeviceToken()
  if (!expectedToken) {
    return Response.json(
      {
        error:
          "MONITOR_DEVICE_TOKEN is not set on this deployment. Add it and redeploy.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }
  if (
    !hasValidDeviceToken(request.headers.get("authorization"), expectedToken)
  ) {
    return Response.json(
      { error: "Missing or wrong device token." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  }
  return null
}
