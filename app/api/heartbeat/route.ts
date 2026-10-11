/*
 * POST /api/heartbeat: the monitor reports every minute that it is running
 * ({ listening }). The scheduler warns the first contact when heartbeats stop;
 * this route tells them when the monitor is back.
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
