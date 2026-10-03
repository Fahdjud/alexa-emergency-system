/*
 * GET or POST /api/escalation/tick: one pass of the escalation scheduler.
 * It escalates unanswered questions and sends every alert that is due.
 *
 * Why this file exists: timers in a browser tab or a serverless function do
 * not survive, so escalation is driven by an outside scheduler calling this
 * every ~30 s: Supabase pg_cron in production, and instrumentation.ts when
 * running locally. Calls are safe to repeat. Protected by
 * "Authorization: Bearer <CRON_SECRET>".
 */
import { bearerToken, secretsMatch } from "@/lib/server/device-token"
import { requireEnv } from "@/lib/server/env"
import { escalationDeps } from "@/lib/server/escalation-deps"
import { runEscalationTick } from "@/lib/server/escalation-runner"

export const maxDuration = 30

async function tick(request: Request) {
  if (!secretsMatch(bearerToken(request.headers.get("authorization")), requireEnv("CRON_SECRET"))) return Response.json({ error: "Unauthorized." }, { status: 401 })

  const result = await runEscalationTick(await escalationDeps())
  return Response.json(result, { headers: { "Cache-Control": "no-store" } })
}

export const GET = tick
export const POST = tick
