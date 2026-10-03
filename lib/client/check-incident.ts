/*
 * check-incident.ts: sends a trigger's audio snippet to /api/incidents/check
 * and returns the validated answer.
 *
 * Why this file exists: the browser cannot hold API keys, so transcription and
 * classification run on the server. Any failure (no token, offline, slow,
 * unexpected answer) is returned as null, and the monitor then asks the
 * person anyway: a failed check never blocks a safety question.
 */
import { encodeWav } from "@/lib/audio/wav"
import {
  AiCheckResponseSchema,
  type AiCheckResponse,
} from "@/lib/safety/schemas"
import type { Language, TriggerMatch } from "@/lib/safety/types"

/** Upload, transcription and classification together; beyond this we stop waiting and ask. */
const TIMEOUT_MS = 15_000

type Input = {
  samples: Float32Array
  sampleRate: number
  trigger: TriggerMatch
  language: Language
  deviceToken: string
}

export async function checkIncident({
  samples,
  sampleRate,
  trigger,
  language,
  deviceToken,
}: Input): Promise<AiCheckResponse | null> {
  const form = new FormData()
  form.append(
    "audio",
    new Blob([encodeWav(samples, sampleRate)], { type: "audio/wav" }),
    "snippet.wav"
  )
  form.append("trigger", JSON.stringify(trigger))
  form.append("language", language)

  try {
    const response = await fetch("/api/incidents/check", {
      method: "POST",
      headers: { Authorization: `Bearer ${deviceToken}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return null
    const parsed = AiCheckResponseSchema.safeParse(await response.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
