/*
 * GET /api/health/config: whether each environment variable is set and well
 * formed on this deployment, never the values.
 */
import { getEnvReport } from "@/lib/server/env"

export async function GET() {
  return Response.json(getEnvReport(), {
    headers: { "Cache-Control": "no-store" },
  })
}
