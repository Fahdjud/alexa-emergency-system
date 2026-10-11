/*
 * The registry of language packs. Adding a language means adding a pack file
 * and listing it in LANGUAGE_PACKS; the language switch, recognition, matching,
 * spoken lines and the scorecard all read from here.
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
