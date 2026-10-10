/*
 * POST /api/test-alert: sends a practice alert (marked TEST) to every
 * contact, for "Test the system" on the monitor. Body: { language }.
 * Answers with the test's id, so the monitor can follow the replies like a
 * real alert, and who it reached.
 *
 * Why this file exists: lets a household check, before a real emergency,
 * that contacts get alerts and that their answer is heard at home. Device-
 * token protected. Refused while a real alert is open, and at most once
 * every 30 seconds.
 */
import { z } from "zod"

import { LanguageSchema } from "@/lib/safety/schemas"
import { rejectUnlessDevice } from "@/lib/server/device-token"
import { emailAlertsConfigured, emailEveryone } from "@/lib/server/email-alert"
import { escalationDeps } from "@/lib/server/escalation-deps"
import { sendTestAlert } from "@/lib/server/test-alert"

const BodySchema = z.object({ language: LanguageSchema })

export async function POST(request: Request) {
  const rejection = rejectUnlessDevice(request)
  if (rejection) return rejection
  const body = BodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success)
    return Response.json({ error: "Expected { language }." }, { status: 400 })

  const result = await sendTestAlert(
    await escalationDeps(),
    body.data.language,
    emailAlertsConfigured() ? emailEveryone : undefined
  )
  if (!result.ok)
    return Response.json(
      {
        error:
          result.reason === "real-alert-active"
            ? "A real alert is open. Try the test once it is over."
            : "A test was just sent. Wait 30 seconds before the next one.",
      },
      { status: result.reason === "real-alert-active" ? 409 : 429 }
    )
  return Response.json(
    {
      id: result.incidentId,
      sentTo: result.sentTo,
      emailed: result.emailed,
    },
    { status: 201 }
  )
}
