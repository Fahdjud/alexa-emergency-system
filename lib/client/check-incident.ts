/*
 * Sends a trigger's snippet to /api/incidents/check and validates the answer.
 * Any failure returns null, and the monitor asks the question anyway: a failed
 * check never blocks a safety question.
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
  /** How sure the AI must be that nothing is wrong to skip the question. */
  dismissAt: number
  deviceToken: string
}

export async function checkIncident({
  samples,
  sampleRate,
  trigger,
  language,
  dismissAt,
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
  form.append("dismissAt", String(dismissAt))

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
