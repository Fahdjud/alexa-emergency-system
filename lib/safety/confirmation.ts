/*
 * Interprets the answer to "Are you okay?" as "fine", "help" or "unclear",
 * using the reply phrases of every language pack.
 *
 * A wrong reading is dangerous, so the rules are strict:
 * 1. Longer phrases are matched first, so "no problem" counts as fine even
 *    though it contains "no", and "not okay" wins over "okay".
 * 2. Any help phrase makes the answer "help", even next to a fine phrase.
 * 3. Anything else is "unclear": the question is repeated until it times out.
 */
import { LANGUAGE_PACKS } from "./languages"
import { containsPhrase, normalizeText, removePhrase } from "./normalize-text"
import type { ReplyIntent } from "./types"

type Phrase = { normalized: string; intent: Exclude<ReplyIntent, "unclear"> }

const PHRASES_LONGEST_FIRST: Phrase[] = Object.values(LANGUAGE_PACKS)
  .flatMap(({ replies }) => [
    ...replies.fine.map((phrase) => ({ phrase, intent: "fine" as const })),
    ...replies.help.map((phrase) => ({ phrase, intent: "help" as const })),
  ])
  .map(({ phrase, intent }) => ({ normalized: normalizeText(phrase), intent }))
  .sort((a, b) => b.normalized.length - a.normalized.length)

export function interpretReply(text: string): ReplyIntent {
  let remaining = normalizeText(text)
  const heard = new Set<ReplyIntent>()

  for (const phrase of PHRASES_LONGEST_FIRST) {
    if (!containsPhrase(remaining, phrase.normalized)) continue
    heard.add(phrase.intent)
    remaining = removePhrase(remaining, phrase.normalized)
  }

  if (heard.has("help")) return "help"
  if (heard.has("fine")) return "fine"
  return "unclear"
}
