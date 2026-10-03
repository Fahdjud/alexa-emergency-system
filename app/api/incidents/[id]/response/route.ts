/*
 * POST /api/incidents/[id]/response: the person's answer to "Are you okay?"
 * ({ answer: "fine" | "help" | "no-answer" }).
 *
 * Why this file exists: the answer decides whether the server cancels the
 * incident or starts alerting contacts. Alerts are sent after the response
 * (next/server `after`), so the monitor is not kept waiting on Telegram.
 */
import { after } from "next/server"
import { z } from "zod"

import { rejectUnlessDevice } from "@/lib/server/device-token"
import { escalationDeps } from "@/lib/server/escalation-deps"
import { answerIncident } from "@/lib/server/escalation-runner"

export const maxDuration = 30

const BodySchema = z.object({ answer: z.enum(["fine", "help", "no-answer"]) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejection = rejectUnlessDevice(request)
  if (rejection) return rejection

  const body = BodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return Response.json({ error: "Expected { answer }." }, { status: 400 })

  const { id } = await params
  const deps = await escalationDeps()
  after(() => answerIncident(deps, id, body.data.answer).catch((error) => console.error("Answering incident failed", error)))
  return Response.json({ accepted: true }, { status: 202 })
}
