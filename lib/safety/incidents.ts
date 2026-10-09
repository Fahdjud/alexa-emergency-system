/*
 * incidents.ts: THE list of incidents the assistant listens for. Adding an
 * incident means adding one entry here; no other file names incident types.
 *
 * Why this file exists: the demo app only has canned chat replies
 * (components/alexa/data.ts). Nothing describes what to listen for, what to
 * ask, or how urgent each situation is.
 *
 * How to read an entry:
 * - triggerSounds: YAMNet class names, spelled exactly as YAMNet spells them.
 * - Phrases, word pairs and the "Are you okay?" question are per language, so
 *   they live in the language packs (lib/safety/languages) and are added to
 *   each entry below.
 * - aiCheck: whether a trigger from that source is first transcribed and
 *   checked by the language model (to filter out the TV, for example). Falls,
 *   alarms and glass go straight to the question: there is nothing useful to
 *   transcribe, and speed matters more.
 * - No entry diagnoses anything. Labels describe what was heard or said.
 */
import { LANGUAGE_PACKS, LANGUAGES } from "./languages"
import type {
  IncidentDefinition,
  IncidentTypeId,
  Language,
  Severity,
} from "./types"

type LanguageNeutral = Omit<
  IncidentDefinition,
  "triggerPhrases" | "triggerWordPairs" | "confirmationQuestion"
>

const DEFINITIONS: LanguageNeutral[] = [
  {
    id: "smoke_co_alarm",
    label: "Smoke or carbon monoxide alarm",
    description:
      "The beeping of a smoke, fire or gas alarm, or someone saying there is a fire.",
    severity: "critical",
    triggerSounds: [
      { label: "Smoke detector, smoke alarm", minScore: 0.3 },
      { label: "Fire alarm", minScore: 0.3 },
    ],
    aiCheck: { sound: false, speech: true },
    notifyOnCancel: true,
  },
  {
    id: "medical_distress",
    label: "Spoken medical distress",
    description:
      "Someone saying they cannot breathe, their chest or head hurts, or they feel dizzy.",
    severity: "critical",
    triggerSounds: [],
    aiCheck: { sound: false, speech: true },
    notifyOnCancel: false,
  },
  {
    id: "fall",
    label: "Possible fall",
    description:
      "A heavy thud or crash, or someone saying they fell or cannot get up.",
    severity: "high",
    triggerSounds: [
      { label: "Thump, thud", minScore: 0.4 },
      { label: "Smash, crash", minScore: 0.4 },
    ],
    aiCheck: { sound: false, speech: true },
    notifyOnCancel: false,
  },
  {
    id: "help_call",
    label: "Call for help",
    description:
      "Someone calling “help”, or asking to call family or an ambulance.",
    severity: "high",
    triggerSounds: [],
    aiCheck: { sound: false, speech: true },
    notifyOnCancel: false,
  },
  {
    id: "screaming_crying",
    label: "Prolonged screaming or crying",
    description: "Screaming or crying that goes on for several seconds.",
    severity: "high",
    triggerSounds: [
      { label: "Screaming", minScore: 0.4, sustainedMs: 5000 },
      { label: "Crying, sobbing", minScore: 0.4, sustainedMs: 8000 },
      { label: "Wail, moan", minScore: 0.4, sustainedMs: 8000 },
    ],
    aiCheck: { sound: true, speech: true },
    notifyOnCancel: false,
  },
  {
    id: "glass_break",
    label: "Glass breaking",
    description: "The sound of glass or a window shattering.",
    severity: "medium",
    triggerSounds: [
      { label: "Shatter", minScore: 0.3 },
      { label: "Glass", minScore: 0.5 },
    ],
    aiCheck: { sound: false, speech: true },
    notifyOnCancel: false,
  },
]

/** Adds each language's phrases and question from its pack. */
function withWords(incident: LanguageNeutral): IncidentDefinition {
  const words = (language: Language) =>
    LANGUAGE_PACKS[language].incidents[incident.id]
  const byLanguage = <T>(pick: (language: Language) => T) =>
    Object.fromEntries(
      LANGUAGES.map((language) => [language, pick(language)])
    ) as Record<Language, T>
  return {
    ...incident,
    triggerPhrases: byLanguage((language) => words(language).phrases),
    triggerWordPairs: byLanguage((language) => words(language).wordPairs),
    confirmationQuestion: byLanguage((language) => words(language).question),
  }
}

export const INCIDENTS: IncidentDefinition[] = DEFINITIONS.map(withWords)

export function getIncident(id: IncidentTypeId): IncidentDefinition {
  const incident = INCIDENTS.find((entry) => entry.id === id)
  if (!incident) throw new Error(`Unknown incident type: ${id}`)
  return incident
}

/** Lower is more severe. Used to pick between simultaneous triggers. */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
}

/** How long the person has to answer the confirmation question before we escalate. */
export const CONFIRMATION_TIMEOUT_MS = 30_000

/**
 * After "I'm fine", the same incident is ignored for this long. An alarm can
 * keep sounding for minutes; we ask again if it is still going after this.
 */
export const SNOOZE_AFTER_CANCEL_MS = 60_000
