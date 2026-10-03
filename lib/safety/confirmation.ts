/*
 * confirmation.ts: understands the answer to "Are you okay?" in English and
 * Arabic: "fine", "help" or "unclear".
 *
 * Why this file exists: the demo app only maps prompts to canned replies.
 * Here a wrong guess is dangerous, so the rules are explicit:
 * 1. Longer phrases win over shorter ones they contain, so "no problem" is
 *    "fine" even though it contains "no", and "not okay" beats "okay".
 * 2. If any help phrase is heard, the answer is "help", even next to a fine
 *    phrase ("I'm fine... no, help").
 * 3. Anything else is "unclear", and the question is asked again or times out.
 */
import { containsPhrase, normalizeText } from "./normalize-text"
import type { ReplyIntent } from "./types"

const FINE_PHRASES = [
  // English
  "i am fine",
  "i am okay",
  "i am ok",
  "i am alright",
  "i am all right",
  "fine",
  "okay",
  "ok",
  "all good",
  "no problem",
  "yes",
  "yeah",
  "yep",
  "cancel",
  "false alarm",
  "never mind",
  "everything is fine",
  "do not call",
  "do not worry",
  // Arabic
  "أنا بخير",
  "بخير",
  "تمام",
  "زين",
  "الحمد لله",
  "نعم",
  "ايوه",
  "إيه",
  "أيوا",
  "إلغاء",
  "الغ",
  "ما في شي",
  "مافي شي",
  "لا بأس",
  "ما فيني شي",
  "مافيني شي",
  "إنذار كاذب",
  "لا تتصل",
  "لا تشيل هم",
]

const HELP_PHRASES = [
  // English
  "help",
  "no",
  "not okay",
  "not ok",
  "not fine",
  "not alright",
  "i am hurt",
  "it hurts",
  "hurt",
  "call",
  "ambulance",
  "emergency",
  "i need help",
  "i cannot",
  "please come",
  "come quickly",
  // Arabic
  "ساعدني",
  "ساعدوني",
  "النجدة",
  "الحقني",
  "الحقوني",
  "لا",
  "مو بخير",
  "مب بخير",
  "مش بخير",
  "لست بخير",
  "مو تمام",
  "اتصل",
  "اتصلوا",
  "إسعاف",
  "الإسعاف",
  "طوارئ",
  "تعبان",
  "تعبانة",
  "أحتاج مساعدة",
  "تعال بسرعة",
  "يوجعني",
]

type Phrase = { normalized: string; intent: Exclude<ReplyIntent, "unclear"> }

const PHRASES_LONGEST_FIRST: Phrase[] = [
  ...FINE_PHRASES.map((phrase) => ({
    normalized: normalizeText(phrase),
    intent: "fine" as const,
  })),
  ...HELP_PHRASES.map((phrase) => ({
    normalized: normalizeText(phrase),
    intent: "help" as const,
  })),
].sort((a, b) => b.normalized.length - a.normalized.length)

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

/** Removes every occurrence, so a shorter phrase cannot match inside a longer one already counted. */
function removePhrase(text: string, phrase: string): string {
  return ` ${text} `.split(` ${phrase} `).join(" | ").trim()
}
