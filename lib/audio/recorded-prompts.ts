/*
 * Recorded voice prompts for the monitor (public/audio/monitor/<folder>/).
 * A language pack names its folder in `recordings`; languages without
 * recordings use the browser voice. Clips are played by prompt-player.ts.
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

export function promptUrl(folder: string, id: PromptId): string {
  return `/audio/monitor/${folder}/${id}.mp3`
}
