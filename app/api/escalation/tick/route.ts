/*
 * GET or POST /api/escalation/tick: one pass of the escalation scheduler.
 * It escalates unanswered questions and sends every alert that is due.
 *
 * Why this file exists: timers in a browser tab or a serverless function do
 * not survive, so escalation is driven by an outside scheduler calling this
 * every ~30 s: Supabase pg_cron in production, and instrumentation.ts when
 * running locally. Each tick also checks the monitor's heartbeat and deletes
 * expired audio and records. Calls are safe to repeat. Protected by
 * "Authorization: Bearer <CRON_SECRET>".
 */
import { bearerToken, secretsMatch } from "@/lib/server/device-token"
import { requireEnv } from "@/lib/server/env"
import { escalationDeps } from "@/lib/server/escalation-deps"
import { runEscalationTick } from "@/lib/server/escalation-runner"
import { checkMonitorHealth } from "@/lib/server/monitor-watch"

export const maxDuration = 30

async function tick(request: Request) {
  if (!secretsMatch(bearerToken(request.headers.get("authorization")), requireEnv("CRON_SECRET"))) {
    return Response.json({ error: "Unauthorized." }, { status: 401 })
  }

  const deps = await escalationDeps()
  const escalation = await runEscalationTick(deps)
  await checkMonitorHealth(deps)
  const deleted = await deps.store.deleteExpired(deps.nowMs)
  return Response.json({ ...escalation, deleted }, { headers: { "Cache-Control": "no-store" } })
}

export const GET = tick
export const POST = tick
