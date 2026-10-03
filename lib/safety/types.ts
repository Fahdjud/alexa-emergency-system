/*
 * types.ts: shared types for the safety assistant (incidents, triggers,
 * contacts, escalation).
 *
 * Why this file exists: the repo's only types describe chat messages and demo
 * devices (components/alexa/types.ts). Nothing describes incidents.
 */

export type Language = "en" | "ar"

/** critical: alert everyone at once. high / medium: alert contacts one by one. */
export type Severity = "critical" | "high" | "medium"

export type IncidentTypeId =
  | "fall"
  | "help_call"
  | "medical_distress"
  | "smoke_co_alarm"
  | "glass_break"
  | "screaming_crying"

export type TriggerSource = "sound" | "speech"

/** A YAMNet class name (exactly as YAMNet spells it) that suggests an incident. */
export type SoundTrigger = {
  label: string
  /** Minimum classifier score, 0-1. */
  minScore: number
  /** When set, the sound must be heard for this long (e.g. prolonged crying), not just once. */
  sustainedMs?: number
}

export type IncidentDefinition = {
  id: IncidentTypeId
  label: string
  severity: Severity
  triggerSounds: SoundTrigger[]
  triggerPhrases: Record<Language, string[]>
  /** Must be a yes/no "are you okay?" question: "yes" is read as "I'm fine". */
  confirmationQuestion: Record<Language, string>
  /** Whether the trigger is first checked by transcription + the language model, per trigger source. */
  aiCheck: Record<TriggerSource, boolean>
  /** When the person says "I'm fine", still send contact 1 a low-urgency note. */
  notifyOnCancel: boolean
}

/** One sound-classifier result: scores by YAMNet label, at a point in time. */
export type SoundFrame = {
  timeMs: number
  scores: Record<string, number>
}

export type TriggerMatch =
  | { incidentId: IncidentTypeId; source: "sound"; label: string; score: number }
  | { incidentId: IncidentTypeId; source: "speech"; phrase: string; language: Language }

export type ReplyIntent = "fine" | "help" | "unclear"

export type Contact = {
  id: string
  name: string
  /** 1 is alerted first. */
  priority: number
}
