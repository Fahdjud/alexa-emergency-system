/*
 * Rules applied to the language model's verdict. The model may only filter out
 * obvious false alarms (for example the TV saying "help"); it can never drop a
 * trigger without a transcript, invent a quote, or change an incident's
 * severity. Keeping these rules in code rather than in the prompt makes them
 * testable and impossible to talk around.
 */
import { getIncident } from "./incidents"
import { containsPhrase, normalizeText } from "./normalize-text"
import type { Classification } from "./schemas"
import type { IncidentTypeId } from "./types"

/** The model must be at least this sure that nothing is wrong before we skip asking. */
const DISMISS_CONFIDENCE = 0.8
/** No household setting may let the model dismiss on a weaker hunch than this. */
const MIN_DISMISS_CONFIDENCE = 0.7

/** Ask the person unless the model is confident, from real words, that there is no incident. Doubt always means asking. */
export function isIncident(
  classification: Classification,
  transcript: string,
  dismissAt: number = DISMISS_CONFIDENCE
): boolean {
  // No transcript (silence, or transcription failed): the model had nothing to judge, so never dismiss.
  if (!transcript.trim()) return true
  return !(
    classification.incidentType === "none" &&
    classification.confidence >= dismissAt
  )
}

/** The household's threshold (from the setup screen), kept within a safe range. */
export function safeDismissThreshold(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return DISMISS_CONFIDENCE
  return Math.min(1, Math.max(MIN_DISMISS_CONFIDENCE, number))
}

/** Keeps the quote only if those exact words are in the transcript; models sometimes paraphrase. */
export function verifiedQuote(
  quote: string | null,
  transcript: string
): string | null {
  if (!quote) return null
  const normalizedQuote = normalizeText(quote)
  return normalizedQuote &&
    containsPhrase(normalizeText(transcript), normalizedQuote)
    ? quote
    : null
}

/** Severity always comes from the config, so escalation timings never depend on the model. */
export function severityFor(incidentType: IncidentTypeId | "none") {
  return incidentType === "none" ? null : getIncident(incidentType).severity
}
