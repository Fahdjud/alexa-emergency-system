/*
 * POST /api/incidents: records an incident when the monitor starts asking
 * "Are you okay?", together with its audio snippet.
 *
 * Why this file exists: escalation has to survive the browser tab. Recording
 * the incident on the server as soon as the question is asked means that if
 * the tab crashes or the device loses power, the server's own deadline
 * (the person's time left plus a grace period) still escalates.
 *
 * Request (multipart, device token): trigger (JSON), language, secondsLeft,
 * optional audio (WAV), transcript, classification (JSON from the AI check).
 * Response: { id }
 */
import { z } from "zod"

import { getIncident } from "@/lib/safety/incidents"
import {
  ClassificationSchema,
  LanguageSchema,
  TriggerMatchSchema,
} from "@/lib/safety/schemas"
import type { TriggerMatch } from "@/lib/safety/types"
import { rejectUnlessDevice } from "@/lib/server/device-token"
import { getStore } from "@/lib/server/providers/store"

/** Extra time on top of the person's 30 s before the server escalates by itself, so it never races the monitor. */
const SERVER_GRACE_MS = 15_000
const MAX_AUDIO_BYTES = 3_000_000

const FieldsSchema = z.object({
  trigger: TriggerMatchSchema,
  language: LanguageSchema,
  secondsLeft: z.coerce.number().min(0).max(30),
  transcript: z.string().max(5000).nullable(),
  classification: ClassificationSchema.nullable(),
})

export async function POST(request: Request) {
  const rejection = rejectUnlessDevice(request)
  if (rejection) return rejection

  const form = await request.formData().catch(() => null)
  const fields = FieldsSchema.safeParse({
    trigger: parseJson(form?.get("trigger")),
    language: form?.get("language"),
    secondsLeft: form?.get("secondsLeft"),
    transcript: stringOrNull(form?.get("transcript")),
    classification: parseJson(form?.get("classification")),
  })
  if (!fields.success)
    return Response.json({ error: "Invalid incident fields." }, { status: 400 })

  const audio = form?.get("audio")
  if (audio instanceof Blob && audio.size > MAX_AUDIO_BYTES)
    return Response.json({ error: "Audio snippet too large." }, { status: 413 })

  const { trigger, language, secondsLeft, transcript, classification } =
    fields.data
  const store = await getStore()
  const incident = await store.createIncident({
    incidentType: trigger.incidentId,
    severity: getIncident(trigger.incidentId).severity,
    language,
    confirmDeadlineMs: Date.now() + secondsLeft * 1000 + SERVER_GRACE_MS,
    triggerDescription: describeTrigger(trigger),
    transcript,
    classification,
  })
  if (audio instanceof Blob && audio.size > 0) {
    const snippetPath = await store.saveSnippet(incident.id, audio)
    await store.updateIncidentIf(
      incident.id,
      { status: ["confirming", "escalating"] },
      { snippetPath }
    )
  }

  return Response.json({ id: incident.id }, { status: 201 })
}

function describeTrigger(trigger: TriggerMatch): string {
  return trigger.source === "sound"
    ? `${trigger.label} (${Math.round(trigger.score * 100)}%)`
    : `“${trigger.phrase}”`
}

function parseJson(value: FormDataEntryValue | null | undefined): unknown {
  if (typeof value !== "string" || value === "") return null
  try {
    return JSON.parse(value)
  } catch {
    return undefined // fails validation
  }
}

function stringOrNull(
  value: FormDataEntryValue | null | undefined
): string | null {
  return typeof value === "string" && value !== "" ? value : null
}
