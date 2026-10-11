/*
 * Speaks a sentence with the browser's speech synthesis. The question has to
 * be heard, not read: the person may be on the floor and unable to see the
 * screen. The best available voice for the language is chosen, preferring
 * natural/neural voices (for example Microsoft Edge's online voices).
 */

import { bestVoice } from "./voice-choice"

const MAX_WAIT_BASE_MS = 2000
const MAX_WAIT_PER_CHARACTER_MS = 120

/** Resolves when speaking ends (or fails), so the caller can listen for the answer straight after. */
export function speak(text: string, languageTag: string): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return Promise.resolve()

  return new Promise((resolve) => {
    // Chrome sometimes never fires "end"; recognition must not stay paused.
    const fallback = setTimeout(
      resolve,
      MAX_WAIT_BASE_MS + text.length * MAX_WAIT_PER_CHARACTER_MS
    )
    const done = () => {
      clearTimeout(fallback)
      resolve()
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = languageTag
    utterance.rate = 0.9 // slightly slower is easier to follow under stress
    const voice = pickVoice(languageTag)
    if (voice) utterance.voice = voice
    utterance.onend = done
    utterance.onerror = done
    window.speechSynthesis.cancel() // never queue behind an earlier sentence
    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window)
    window.speechSynthesis.cancel()
}

function pickVoice(languageTag: string): SpeechSynthesisVoice | undefined {
  return bestVoice(window.speechSynthesis.getVoices(), languageTag)
}

/** The voice that will be used for this language, for the troubleshooting panel. */
export function voiceName(languageTag: string): string | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return null
  return pickVoice(languageTag)?.name ?? null
}

// Some browsers load the voice list asynchronously; asking early makes it
// ready before the first question.
if (typeof window !== "undefined" && "speechSynthesis" in window)
  window.speechSynthesis.getVoices()
