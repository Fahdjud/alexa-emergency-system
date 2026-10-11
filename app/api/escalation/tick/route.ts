/*
 * GET or POST /api/escalation/tick: one scheduler pass. Escalates unanswered
 * questions, sends due alerts, checks the monitor's heartbeat and deletes
 * expired data. Called every 30 s by Supabase pg_cron (instrumentation.ts in
 * development). Idempotent. Requires "Authorization: Bearer <CRON_SECRET>".
 */
import { bearerToken, secretsMatch } from "@/lib/server/device-token"
import { requireEnv } from "@/lib/server/env"
import { escalationDeps } from "@/lib/server/escalation-deps"
import { runEscalationTick } from "@/lib/server/escalation-runner"
import { checkMonitorHealth } from "@/lib/server/monitor-watch"

export const maxDuration = 30

async function tick(request: Request) {
  if (
    !secretsMatch(
      bearerToken(request.headers.get("authorization")),
      requireEnv("CRON_SECRET")
    )
  ) {
    return Response.json({ error: "Unauthorized." }, { status: 401 })
  }

  const deps = await escalationDeps()
  const escalation = await runEscalationTick(deps)
  await checkMonitorHealth(deps)
  const deleted = await deps.store.deleteExpired(deps.nowMs)
  return Response.json(
    { ...escalation, deleted },
    { headers: { "Cache-Control": "no-store" } }
  )
}

export const GET = tick
export const POST = tick
