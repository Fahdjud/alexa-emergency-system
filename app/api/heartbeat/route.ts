/*
 * POST /api/heartbeat: the monitor page says "I'm still here" every minute
 * ({ listening: boolean }).
 *
 * Why this file exists: without it, a closed tab or a dead tablet would go
 * unnoticed. The scheduler tells contact 1 when heartbeats stop, and this
 * route tells them when the monitor is back. Device-token protected.
 */
import { z } from "zod"

import { rejectUnlessDevice } from "@/lib/server/device-token"
import { escalationDeps } from "@/lib/server/escalation-deps"
import { recordHeartbeat } from "@/lib/server/monitor-watch"

const BodySchema = z.object({ listening: z.boolean() })

export async function POST(request: Request) {
  const rejection = rejectUnlessDevice(request)
  if (rejection) return rejection
  const body = BodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success)
    return Response.json({ error: "Expected { listening }." }, { status: 400 })

  await recordHeartbeat(await escalationDeps(), body.data.listening)
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  )
}
