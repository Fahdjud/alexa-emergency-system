/*
 * POST /api/incidents/[id]/response: the answer to "Are you okay?"
 * (fine, help or no-answer). Alerts are sent after the response with
 * next/server `after`, so the monitor never waits on Telegram.
 */
import { after } from "next/server"
import { z } from "zod"

import { escalationDeps } from "@/lib/server/escalation-deps"
import { answerIncident } from "@/lib/server/escalation-runner"

export const maxDuration = 30

const BodySchema = z.object({ answer: z.enum(["fine", "help", "no-answer"]) })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = BodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success)
    return Response.json({ error: "Expected { answer }." }, { status: 400 })

  const { id } = await params
  const deps = await escalationDeps()
  after(() =>
    answerIncident(deps, id, body.data.answer).catch((error) =>
      console.error("Answering incident failed", error)
    )
  )
  return Response.json({ accepted: true }, { status: 202 })
}
