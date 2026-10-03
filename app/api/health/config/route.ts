/*
 * GET /api/health/config: reports whether each environment variable is set and
 * correctly shaped on this deployment, without ever returning a value.
 *
 * Why this file exists: the app had no API routes, and Vercel hides
 * "Sensitive" values, so there was no way to confirm a deployment can read
 * its keys. Requires "Authorization: Bearer <MONITOR_DEVICE_TOKEN>", so only
 * the household's own device can see even this yes/no list.
 */
import { rejectUnlessDevice } from "@/lib/server/device-token"
import { getEnvReport } from "@/lib/server/env"

export async function GET(request: Request) {
  const rejection = rejectUnlessDevice(request)
  if (rejection) return rejection
  return Response.json(getEnvReport(), {
    headers: { "Cache-Control": "no-store" },
  })
}
