/*
 * normalize-text.ts: turns speech-recognition output and config phrases into
 * one comparable form, for English and Arabic.
 *
 * Why this file exists: the demo app compares text with a plain
 * .includes() (getDemoReply), which misses "I have fallen" vs "I've fallen" and
 * Arabic spelling variants (أ/إ/ا, ة/ه, diacritics). Both the config phrases
 * and the transcript go through the same function, so the config can be
 * written naturally.
 */

const ENGLISH_CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, "cannot"],
  [/\bcan not\b/g, "cannot"],
  [/\bwon't\b/g, "will not"],
  [/\b(\w+)n't\b/g, "$1 not"],
  [/\bi'm\b/g, "i am"],
  [/\b(\w+)'ve\b/g, "$1 have"],
  [/\b(\w+)'re\b/g, "$1 are"],
  [/\b(\w+)'ll\b/g, "$1 will"],
  [/\b(it|that|there|what|everything)'s\b/g, "$1 is"],
]

export function normalizeText(text: string): string {
  let result = text.toLowerCase().replace(/[‘’ʼ`]/g, "'")
  for (const [pattern, replacement] of ENGLISH_CONTRACTIONS) result = result.replace(pattern, replacement)
  return normalizeArabic(result)
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // punctuation (incl. Arabic ، ؟) becomes a word break
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ْٰ]/g, "") // diacritics (tashkeel)
    .replace(/ـ/g, "") // tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
}

/** True when every word of the phrase appears, in order and adjacent, in the text. Both must be normalised. */
export function containsPhrase(normalizedText: string, normalizedPhrase: string): boolean {
  if (!normalizedPhrase) return false
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `)
}
