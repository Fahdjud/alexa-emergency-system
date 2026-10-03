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

import { getMonitorDeviceToken } from "./env"

export function hasValidDeviceToken(authorizationHeader: string | null, expectedToken: string): boolean {
  const presented = authorizationHeader?.match(/^Bearer (.+)$/)?.[1]
  if (!presented) return false
  return timingSafeEqual(sha256(presented), sha256(expectedToken))
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest()
}

/** For API routes: returns an error response unless the request carries the household's device token. */
export function rejectUnlessDevice(request: Request): Response | null {
  const expectedToken = getMonitorDeviceToken()
  if (!expectedToken) {
    return Response.json(
      { error: "MONITOR_DEVICE_TOKEN is not set on this deployment. Add it and redeploy." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
  if (!hasValidDeviceToken(request.headers.get("authorization"), expectedToken)) {
    return Response.json({ error: "Missing or wrong device token." }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }
  return null
}
