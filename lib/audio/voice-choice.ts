/*
 * Chooses the best speech-synthesis voice for a language. Browsers list many
 * voices of very different quality; natural and neural voices (Microsoft
 * Edge's "Online (Natural)" voices, Google's network voices) are much easier
 * to understand than the older compact ones.
 */

type Voice = Pick<SpeechSynthesisVoice, "name" | "lang" | "localService">

const NATURAL = /natural|neural|online|premium|enhanced/i
const NETWORK = /google/i
const ROBOTIC = /compact|espeak|robot/i

/** Higher is better; a voice in another language scores below zero. */
export function voiceScore(voice: Voice, languageTag: string): number {
  const lang = voice.lang.replace("_", "-").toLowerCase()
  const wanted = languageTag.toLowerCase()
  const base = wanted.split("-")[0]
  if (lang !== wanted && !lang.startsWith(`${base}-`) && lang !== base)
    return -1
  let score = lang === wanted ? 4 : 2
  if (NATURAL.test(voice.name)) score += 3
  else if (NETWORK.test(voice.name)) score += 1
  if (ROBOTIC.test(voice.name)) score -= 3
  return score
}

export function bestVoice<V extends Voice>(
  voices: V[],
  languageTag: string
): V | undefined {
  let best: V | undefined
  let bestScore = -1
  for (const voice of voices) {
    const score = voiceScore(voice, languageTag)
    if (score > bestScore) {
      best = voice
      bestScore = score
    }
  }
  return best
}
