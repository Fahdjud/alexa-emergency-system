/*
 * ai-check.ts: the plain rules applied to the language model's answer.
 *
 * Why this file exists: the model may only *filter out* obvious false alarms
 * (the TV saying "help"). It must never be able to silently drop a real
 * incident, invent a quote, or change how urgent an incident is. Those rules
 * live here as small pure functions, not in a prompt.
 */
import { getIncident } from "./incidents"
import { containsPhrase, normalizeText } from "./normalize-text"
import type { Classification } from "./schemas"
import type { IncidentTypeId } from "./types"

/** The model must be at least this sure that nothing is wrong before we skip asking. */
export const DISMISS_CONFIDENCE = 0.8

/** Ask the person unless the model is confident there is no incident. Doubt always means asking. */
export function isIncident(classification: Classification): boolean {
  return !(
    classification.incidentType === "none" &&
    classification.confidence >= DISMISS_CONFIDENCE
  )
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
