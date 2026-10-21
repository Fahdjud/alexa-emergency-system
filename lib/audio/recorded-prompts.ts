/*
 * Recorded voice prompts for the monitor (public/audio/monitor/<folder>/).
 * A language pack names its folder in `recordings`; languages without
 * recordings use the browser voice. Clips play one after another, and the
 * caller falls back to the browser voice if a clip cannot play.
 */
import type { IncidentTypeId } from "@/lib/safety/types"

export const PROMPT_IDS = [
  "question_smoke_alarm",
  "question_medical",
  "question_fall",
  "question_help_call",
  "question_screaming",
  "question_glass",
  "reply_hint",
  "cancelled",
  "escalated",
  "unacknowledged",
  "on_my_way",
  "calling",
  "handling",
  "test_intro",
  "test_heard",
] as const

export type PromptId = (typeof PROMPT_IDS)[number]

/** The "Are you okay?" question recorded for each incident. */
export const QUESTION_PROMPT: Record<IncidentTypeId, PromptId> = {
  smoke_co_alarm: "question_smoke_alarm",
  medical_distress: "question_medical",
  fall: "question_fall",
  help_call: "question_help_call",
  screaming_crying: "question_screaming",
  glass_break: "question_glass",
}

/** A clip that never reports "ended" is given up on after this long. */
const MAX_CLIP_MS = 15_000

let current: HTMLAudioElement | null = null

export function promptUrl(folder: string, id: PromptId): string {
  return `/audio/monitor/${folder}/${id}.mp3`
}

/** Plays the clips in order. Resolves false if any clip cannot play. */
export async function playPrompts(
  folder: string,
  ids: PromptId[]
): Promise<boolean> {
  if (typeof Audio === "undefined") return false
  stopPrompts()
  for (const id of ids) {
    const audio = new Audio(promptUrl(folder, id))
    current = audio
    const finished = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(true), MAX_CLIP_MS)
      const done = (ok: boolean) => {
        clearTimeout(timeout)
        resolve(ok)
      }
      audio.onended = () => done(true)
      audio.onerror = () => done(false)
      audio.onpause = () => done(current === audio)
      audio.play().catch(() => done(false))
    })
    if (current !== audio) return true // stopped on purpose
    if (!finished) return false
  }
  current = null
  return true
}

export function stopPrompts(): void {
  const playing = current
  current = null
  playing?.pause()
}
