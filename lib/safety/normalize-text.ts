/*
 * Normalises speech-recognition output and configured phrases into one
 * comparable form: English contractions are expanded, and Arabic diacritics,
 * tatweel and letter variants (أ/إ/آ/ا, ة/ه, ى/ي) are unified. Phrases can
 * therefore be written naturally and listed once.
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
  [
    /\b(it|that|there|what|everything|something|someone|somebody|nothing|he|she|who)'s\b/g,
    "$1 is",
  ],
]

export function normalizeText(text: string): string {
  let result = text.toLowerCase().replace(/[‘’ʼ`]/g, "'")
  for (const [pattern, replacement] of ENGLISH_CONTRACTIONS)
    result = result.replace(pattern, replacement)
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

/**
 * Replaces every whole-word occurrence of the phrase with a "|" break, so
 * nothing can match across the gap. Both must be normalised.
 */
export function removePhrase(
  normalizedText: string,
  normalizedPhrase: string
): string {
  if (!normalizedPhrase) return normalizedText
  return ` ${normalizedText} `.split(` ${normalizedPhrase} `).join(" | ").trim()
}

/** True when every word of the phrase appears, in order and adjacent, in the text. Both must be normalised. */
export function containsPhrase(
  normalizedText: string,
  normalizedPhrase: string
): boolean {
  if (!normalizedPhrase) return false
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `)
}
