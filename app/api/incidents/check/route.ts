/*
 * POST /api/incidents/check: transcribes a trigger's snippet and classifies
 * it. Nothing is stored; the snippet is used for this request only.
 *
 * Request (multipart, household code): audio (WAV), trigger (TriggerMatch
 * JSON), language, optional dismissAt (how confident the model must be to skip
 * the question; clamped server-side).
 * Response: { transcript, classification, isIncident }
 */
import { isIncident, safeDismissThreshold } from "@/lib/safety/ai-check"
import {
  LanguageSchema,
  TriggerMatchSchema,
  type AiCheckResponse,
} from "@/lib/safety/schemas"
import { rejectUnlessDevice } from "@/lib/server/device-token"
import { getIncidentClassifier } from "@/lib/server/providers/incident-classifier"
import { getSpeechToText } from "@/lib/server/providers/speech-to-text"

export const maxDuration = 30

/** 21 s of 16 kHz 16-bit mono WAV is about 0.7 MB; allow some headroom, stay under Vercel's 4.5 MB body limit. */
const MAX_AUDIO_BYTES = 3_000_000

export async function POST(request: Request) {
  const rejection = rejectUnlessDevice(request)
  if (rejection) return rejection

  const form = await request.formData().catch(() => null)
  const audio = form?.get("audio")
  const trigger = TriggerMatchSchema.safeParse(parseJson(form?.get("trigger")))
  const language = LanguageSchema.safeParse(form?.get("language"))
  if (!(audio instanceof Blob) || !trigger.success || !language.success) {
    return Response.json(
      { error: "Expected audio, trigger and language." },
      { status: 400 }
    )
  }
  if (audio.size > MAX_AUDIO_BYTES)
    return Response.json({ error: "Audio snippet too large." }, { status: 413 })

  // Transcription failure is not fatal: the classifier still sees the trigger.
  const transcript = await getSpeechToText()
    .transcribe(audio, language.data)
    .catch((error) => {
      console.error("Transcription failed", error)
      return ""
    })

  const classification = await getIncidentClassifier().classify({
    transcript,
    trigger: trigger.data,
    language: language.data,
  })
  const body: AiCheckResponse = {
    transcript,
    classification,
    isIncident: isIncident(
      classification,
      transcript,
      safeDismissThreshold(form?.get("dismissAt") ?? undefined)
    ),
  }
  return Response.json(body, { headers: { "Cache-Control": "no-store" } })
}

function parseJson(value: FormDataEntryValue | null | undefined): unknown {
  if (typeof value !== "string") return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
