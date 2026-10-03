/*
 * GET /api/health/config: reports whether each environment variable is set and
 * correctly shaped on this deployment, without ever returning a value.
 *
 * Why this file exists: the app had no API routes, and Vercel hides
 * "Sensitive" values, so there was no way to confirm a deployment can read
 * its keys. Requires "Authorization: Bearer <MONITOR_DEVICE_TOKEN>", so only
 * the household's own device can see even this yes/no list.
 */
import { hasValidDeviceToken } from "@/lib/server/device-token"
import { getEnvReport, getMonitorDeviceToken } from "@/lib/server/env"

export async function GET(request: Request) {
  const expectedToken = getMonitorDeviceToken()
  if (!expectedToken) {
    return noStoreJson(503, {
      error: "MONITOR_DEVICE_TOKEN is not set on this deployment, so the health check cannot check who is asking. Add it and redeploy.",
    })
  }

  if (!hasValidDeviceToken(request.headers.get("authorization"), expectedToken)) {
    return noStoreJson(401, { error: "Missing or wrong device token." })
  }

  return noStoreJson(200, getEnvReport())
}

function noStoreJson(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}
