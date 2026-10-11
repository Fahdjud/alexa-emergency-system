/*
 * IncidentClassifier interface and provider selection (CLASSIFIER_PROVIDER).
 * If the language model fails or times out, the rules classifier answers
 * instead, so an outage cannot block a safety check.
 */
import "server-only"

import { getClassifierProvider } from "@/lib/server/env"
import type { Classification } from "@/lib/safety/schemas"
import type { Language, TriggerMatch } from "@/lib/safety/types"

import { createAnthropicClassifier } from "./classifier-anthropic"
import { rulesClassifier } from "./classifier-rules"

export type ClassifierInput = {
  transcript: string
  trigger: TriggerMatch
  language: Language
}

export interface IncidentClassifier {
  classify(input: ClassifierInput): Promise<Classification>
}

export function getIncidentClassifier(): IncidentClassifier {
  if (getClassifierProvider() === "rules") return rulesClassifier
  const primary = createAnthropicClassifier()
  return {
    async classify(input) {
      try {
        return await primary.classify(input)
      } catch (error) {
        console.error(
          "Language model classification failed; using rules instead.",
          error
        )
        return rulesClassifier.classify(input)
      }
    },
  }
}
