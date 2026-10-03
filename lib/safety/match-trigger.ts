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
import { containsPhrase, normalizeText } from "./normalize-text"
import type { IncidentDefinition, Language, SoundFrame, SoundTrigger, TriggerMatch } from "./types"

/** A sustained sound must be above its threshold in this share of the frames in its window. */
const SUSTAINED_SHARE = 0.7

/**
 * Sound matches for the newest frame. `frames` is the recent classifier
 * history, oldest first; only sustained triggers look further back than the
 * newest frame.
 */
export function matchSound(frames: SoundFrame[], incidents: IncidentDefinition[] = INCIDENTS): TriggerMatch[] {
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
      })),
  )
}

function isTriggered(trigger: SoundTrigger, frames: SoundFrame[], latest: SoundFrame): boolean {
  const scoreOf = (frame: SoundFrame) => frame.scores[trigger.label] ?? 0
  if (scoreOf(latest) < trigger.minScore) return false
  if (!trigger.sustainedMs) return true

  const windowStart = latest.timeMs - trigger.sustainedMs
  const coversWindow = frames[0].timeMs <= windowStart
  const inWindow = frames.filter((frame) => frame.timeMs >= windowStart)
  const loudFrames = inWindow.filter((frame) => scoreOf(frame) >= trigger.minScore)
  return coversWindow && loudFrames.length >= inWindow.length * SUSTAINED_SHARE
}

/** Speech matches, one per incident, using that incident's longest matching phrase (the best quote). */
export function matchPhrase(
  text: string,
  language: Language,
  incidents: IncidentDefinition[] = INCIDENTS,
): TriggerMatch[] {
  const normalized = normalizeText(text)
  if (!normalized) return []

  return incidents.flatMap((incident) => {
    const phrase = incident.triggerPhrases[language]
      .filter((candidate) => containsPhrase(normalized, normalizeText(candidate)))
      .sort((a, b) => b.length - a.length)[0]
    return phrase ? [{ incidentId: incident.id, source: "speech" as const, phrase, language }] : []
  })
}

/** When several incidents match at once, act on the most severe; ties go to config order. */
export function pickMostSevere(matches: TriggerMatch[], incidents: IncidentDefinition[] = INCIDENTS): TriggerMatch | null {
  const rank = (match: TriggerMatch) => {
    const index = incidents.findIndex((incident) => incident.id === match.incidentId)
    return SEVERITY_RANK[incidents[index].severity] * incidents.length + index
  }
  return [...matches].sort((a, b) => rank(a) - rank(b))[0] ?? null
}

/** Whether this trigger should be transcribed and checked by the language model before asking. */
export function needsAiCheck(match: TriggerMatch, incidents: IncidentDefinition[] = INCIDENTS): boolean {
  const incident = incidents.find((entry) => entry.id === match.incidentId)
  return incident?.aiCheck[match.source] ?? true
}
