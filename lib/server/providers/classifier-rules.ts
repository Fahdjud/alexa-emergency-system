/*
 * Deterministic fallback classifier using the same phrase lists as the
 * browser. It never answers "none", so without the language model every
 * trigger still reaches the confirmation question.
 */
import { matchPhrase, pickMostSevere } from "@/lib/safety/match-trigger"
import { severityFor } from "@/lib/safety/ai-check"

import type { IncidentClassifier } from "./incident-classifier"

/** Lower than a typical model answer: rules cannot tell the TV from a person. */
const PHRASE_CONFIDENCE = 0.6
const TRIGGER_ONLY_CONFIDENCE = 0.5

export const rulesClassifier: IncidentClassifier = {
  async classify({ transcript, trigger, language }) {
    const spoken = pickMostSevere(matchPhrase(transcript, language))
    const incidentType = spoken?.incidentId ?? trigger.incidentId
    return {
      incidentType,
      severity: severityFor(incidentType),
      confidence: spoken ? PHRASE_CONFIDENCE : TRIGGER_ONLY_CONFIDENCE,
      supportingQuote: spoken?.source === "speech" ? spoken.phrase : null,
      source: "rules",
    }
  },
}
