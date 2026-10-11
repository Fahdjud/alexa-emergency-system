/*
 * Accuracy scorecard for the speech rules, computed from each language pack's
 * test sentences: emergencies caught, everyday sentences wrongly flagged, and
 * replies read correctly, with every failing sentence listed. It measures the
 * keyword layer only; the AI check and the confirmation question come after
 * it. Run with `pnpm scorecard`.
 */
import { interpretReply } from "./confirmation"
import { INCIDENTS } from "./incidents"
import { LANGUAGE_PACKS, LANGUAGES, type Language } from "./languages"
import { matchPhrase } from "./match-trigger"
import type { IncidentDefinition } from "./types"

export type LanguageScore = {
  language: Language
  caught: { passed: number; total: number; missed: string[] }
  everyday: { flagged: number; total: number; examples: string[] }
  replies: { passed: number; total: number; wrong: string[] }
}

export function scoreLanguage(
  language: Language,
  incidents: IncidentDefinition[] = INCIDENTS
): LanguageScore {
  const { samples } = LANGUAGE_PACKS[language]
  const matched = (text: string) =>
    matchPhrase(text, language, incidents).map((match) => match.incidentId)

  const missed = samples.triggers
    .filter(({ text, incident }) => !matched(text).includes(incident))
    .map(({ text, incident }) => `${text} (expected ${incident})`)
  const flagged = samples.everyday
    .filter((text) => matched(text).length > 0)
    .map((text) => `${text} (${matched(text).join(", ")})`)
  const wrong = samples.replies
    .filter(({ text, intent }) => interpretReply(text) !== intent)
    .map(
      ({ text, intent }) =>
        `${text} (read as ${interpretReply(text)}, expected ${intent})`
    )

  return {
    language,
    caught: {
      passed: samples.triggers.length - missed.length,
      total: samples.triggers.length,
      missed,
    },
    everyday: {
      flagged: flagged.length,
      total: samples.everyday.length,
      examples: flagged,
    },
    replies: {
      passed: samples.replies.length - wrong.length,
      total: samples.replies.length,
      wrong,
    },
  }
}

export function scoreAllLanguages(): LanguageScore[] {
  return LANGUAGES.map((language) => scoreLanguage(language))
}

/** A plain-text table for the terminal. */
export function formatScorecard(scores: LanguageScore[]): string {
  const percent = (part: number, total: number) =>
    `${part}/${total} (${Math.round((100 * part) / Math.max(total, 1))}%)`
  return scores
    .map((score) => {
      const { name } = LANGUAGE_PACKS[score.language]
      const lines = [
        `${name}`,
        `  Emergencies caught:        ${percent(score.caught.passed, score.caught.total)}`,
        `  Everyday speech flagged:   ${percent(score.everyday.flagged, score.everyday.total)}`,
        `  "Are you okay?" answers:   ${percent(score.replies.passed, score.replies.total)}`,
        ...score.caught.missed.map((text) => `    missed: ${text}`),
        ...score.everyday.examples.map((text) => `    flagged: ${text}`),
        ...score.replies.wrong.map((text) => `    misread: ${text}`),
      ]
      return lines.join("\n")
    })
    .join("\n\n")
}
