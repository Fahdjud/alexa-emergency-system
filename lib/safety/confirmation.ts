/*
 * confirmation.ts: understands the answer to "Are you okay?" in English and
 * Arabic: "fine", "help" or "unclear".
 *
 * Why this file exists: the demo app only maps prompts to canned replies.
 * The phrases come from every language pack, so an answer in any language
 * is understood whatever the language switch says.
 * Here a wrong guess is dangerous, so the rules are explicit:
 * 1. Longer phrases win over shorter ones they contain, so "no problem" is
 *    "fine" even though it contains "no", and "not okay" beats "okay".
 * 2. If any help phrase is heard, the answer is "help", even next to a fine
 *    phrase ("I'm fine... no, help").
 * 3. Anything else is "unclear", and the question is asked again or times out.
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
