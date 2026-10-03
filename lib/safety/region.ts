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

/** What the device says after the answer. */
export const OUTCOME_LINES: Record<"cancelled" | "escalated", Record<Language, string>> = {
  cancelled: {
    en: "Okay, I'm glad you're fine. I'll keep listening.",
    ar: "حسنًا، الحمد لله أنك بخير. سأبقى أستمع.",
  },
  escalated: {
    en: `I'm alerting your contacts now. If you can, call ${EMERGENCY_NUMBERS.unified}.`,
    ar: `سأنبه جهات الاتصال الآن. إذا استطعت، اتصل على ${EMERGENCY_NUMBERS.unified}.`,
  },
}

/** Said while escalated, once the server reports how it is going. */
export const SERVER_OUTCOME_LINES = {
  acknowledged: (name: string): Record<Language, string> => ({
    en: `${name} has seen the alert and is handling it.`,
    ar: `${name} اطّلع على التنبيه ويتولى الأمر.`,
  }),
  unacknowledged: {
    en: `I couldn't reach anyone. If you can, call ${EMERGENCY_NUMBERS.unified} now.`,
    ar: `لم أتمكن من الوصول لأحد. إذا استطعت، اتصل على ${EMERGENCY_NUMBERS.unified} الآن.`,
  } satisfies Record<Language, string>,
}
