/*
 * languages/index.ts: the languages the assistant speaks.
 *
 * Why this file exists: it is the one list of language packs. To add a
 * language, copy en.ts to <code>.ts, translate it with a native speaker,
 * import it here and add it to LANGUAGE_PACKS. The language switch, speech
 * recognition, matching, replies, spoken lines and the scorecard all pick it
 * up from here.
 */
import { ar } from "./ar"
import { en } from "./en"
import type { LanguagePack } from "./pack"

export const LANGUAGE_PACKS = { en, ar } satisfies Record<string, LanguagePack>

export type Language = keyof typeof LANGUAGE_PACKS

export const LANGUAGES = Object.keys(LANGUAGE_PACKS) as Language[]

export function isLanguage(value: string): value is Language {
  return Object.hasOwn(LANGUAGE_PACKS, value)
}

export function languagePack(language: Language): LanguagePack {
  return LANGUAGE_PACKS[language]
}

export type { LanguagePack } from "./pack"
