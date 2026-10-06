/*
 * match-trigger.ts: decides whether recent sounds or recognised speech match
 * an incident in the config.
 *
 * Why this file exists: the demo app has no detection logic. Keeping matching
 * as pure functions (no microphone, no models) means the rules can be tested
 * and explained on their own, and work the same in the browser and on the
 * server (the rules-based fallback classifier reuses matchPhrase).
 */
import { INCIDENTS, SEVERITY_RANK } from "./incidents"
import { SUPPORTED_LANGUAGES } from "./region"
import { containsPhrase, normalizeText } from "./normalize-text"
import type {
  IncidentDefinition,
  Language,
  SoundFrame,
  SoundTrigger,
  TriggerMatch,
} from "./types"

/** A sustained sound must be above its threshold in this share of the frames in its window. */
const SUSTAINED_SHARE = 0.7

/**
 * Sound matches for the newest frame. `frames` is the recent classifier
 * history, oldest first; only sustained triggers look further back than the
 * newest frame.
 */
export function matchSound(
  frames: SoundFrame[],
  incidents: IncidentDefinition[] = INCIDENTS
): TriggerMatch[] {
  const latest = frames.at(-1)
  if (!latest) return []

  return incidents.flatMap((incident) =>
    incident.triggerSounds
      .filter((trigger) => isTriggered(trigger, frames, latest))
      .map((trigger) => ({
        incidentId: incident.id,
        source: "sound" as const,
        label: trigger.label,
        score: latest.scores[trigger.label] ?? 0,
      }))
  )
}

function isTriggered(
  trigger: SoundTrigger,
  frames: SoundFrame[],
  latest: SoundFrame
): boolean {
  const scoreOf = (frame: SoundFrame) => frame.scores[trigger.label] ?? 0
  if (scoreOf(latest) < trigger.minScore) return false
  if (!trigger.sustainedMs) return true

  const windowStart = latest.timeMs - trigger.sustainedMs
  const coversWindow = frames[0].timeMs <= windowStart
  const inWindow = frames.filter((frame) => frame.timeMs >= windowStart)
  const loudFrames = inWindow.filter(
    (frame) => scoreOf(frame) >= trigger.minScore
  )
  return coversWindow && loudFrames.length >= inWindow.length * SUSTAINED_SHARE
}

/**
 * Speech matches, one per incident: the longest matching phrase (the best
 * quote), or else a word pair such as "heart" + "hurts".
 */
export function matchPhrase(
  text: string,
  language: Language,
  incidents: IncidentDefinition[] = INCIDENTS
): TriggerMatch[] {
  const normalized = normalizeText(text)
  if (!normalized) return []

  return incidents.flatMap((incident) => {
    const phrase =
      incident.triggerPhrases[language]
        .filter((candidate) =>
          containsPhrase(normalized, normalizeText(candidate))
        )
        .sort((a, b) => b.length - a.length)[0] ??
      matchWordPair(normalized, incident.triggerWordPairs?.[language])
    return phrase
      ? [
          {
            incidentId: incident.id,
            source: "speech" as const,
            phrase,
            language,
          },
        ]
      : []
  })
}

/** Returns "first second" when one word from each list is in the text, else undefined. */
function matchWordPair(
  normalizedText: string,
  pair: [string[], string[]] | undefined
): string | undefined {
  if (!pair) return undefined
  const words = new Set(normalizedText.split(" "))
  const [first, second] = pair.map((list) =>
    list.find((word) => words.has(normalizeText(word)))
  )
  return first && second ? `${first} … ${second}` : undefined
}

/**
 * Speech matches in every supported language. Recognition runs in one language at a time,
 * but a transcript in either script is checked against both phrase lists, so a phrase is
 * never missed because of the language switch.
 */
export function matchPhraseInAnyLanguage(
  text: string,
  incidents: IncidentDefinition[] = INCIDENTS
): TriggerMatch[] {
  return SUPPORTED_LANGUAGES.flatMap((language) =>
    matchPhrase(text, language, incidents)
  )
}

/** When several incidents match at once, act on the most severe; ties go to config order. */
export function pickMostSevere(
  matches: TriggerMatch[],
  incidents: IncidentDefinition[] = INCIDENTS
): TriggerMatch | null {
  const rank = (match: TriggerMatch) => {
    const index = incidents.findIndex(
      (incident) => incident.id === match.incidentId
    )
    return SEVERITY_RANK[incidents[index].severity] * incidents.length + index
  }
  return [...matches].sort((a, b) => rank(a) - rank(b))[0] ?? null
}

/** Whether this trigger should be transcribed and checked by the language model before asking. */
export function needsAiCheck(
  match: TriggerMatch,
  incidents: IncidentDefinition[] = INCIDENTS
): boolean {
  const incident = incidents.find((entry) => entry.id === match.incidentId)
  return incident?.aiCheck[match.source] ?? true
}

/** Enough classifier history for the longest sustained sound in the config, plus a margin. */
export function soundHistoryMs(
  incidents: IncidentDefinition[] = INCIDENTS
): number {
  const longest = Math.max(
    0,
    ...incidents.flatMap((incident) =>
      incident.triggerSounds.map((trigger) => trigger.sustainedMs ?? 0)
    )
  )
  return longest + 2000
}

/** Adds a frame and drops frames too old to matter, so memory stays constant. */
export function addSoundFrame(
  frames: SoundFrame[],
  frame: SoundFrame,
  keepMs = soundHistoryMs()
): SoundFrame[] {
  return [...frames, frame].filter(
    (existing) => existing.timeMs >= frame.timeMs - keepMs
  )
}
