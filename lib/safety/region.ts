/*
 * region.ts: settings that depend on where the household is (Saudi Arabia):
 * languages, emergency numbers and the spoken reply hint.
 *
 * Why this file exists: the demo app is English-only and has no notion of a
 * region. Keeping these in one place means a different country is a change to
 * this file only.
 */
import type { Language } from "./types"

export const SUPPORTED_LANGUAGES: Language[] = ["en", "ar"]

/** BCP 47 tags for speech recognition and speech synthesis. */
export const SPEECH_LANGUAGE_TAGS: Record<Language, string> = {
  en: "en-US",
  ar: "ar-SA",
}

/** Saudi Arabia. 911 is the unified number in the main regions; the others work everywhere. */
export const EMERGENCY_NUMBERS = {
  unified: "911",
  ambulance: "997",
  civilDefence: "998",
  police: "999",
} as const

/** Said after every confirmation question, so the person knows what to answer. */
export const REPLY_HINT: Record<Language, string> = {
  en: "Say I'm fine, or say help.",
  ar: "قل أنا بخير، أو قل ساعدني.",
}
