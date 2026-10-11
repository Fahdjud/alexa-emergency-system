/*
 * GET /api/health/config: whether each environment variable is set and well
 * formed on this deployment, never the values. Requires the household code.
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
