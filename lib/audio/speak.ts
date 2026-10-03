/*
 * speak.ts: says a sentence aloud with the browser's built-in speech
 * synthesis, in English or Arabic.
 *
 * Why this file exists: the demo app only shows text. The safety assistant
 * must ask "Are you okay?" out loud, because the person may be on the floor
 * and unable to see the screen. Speech synthesis is free and on-device.
 */

const MAX_WAIT_BASE_MS = 2000
const MAX_WAIT_PER_CHARACTER_MS = 120

/** Resolves when speaking ends (or fails), so the caller can listen for the answer straight after. */
export function speak(text: string, languageTag: string): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return Promise.resolve()

  return new Promise((resolve) => {
    // Chrome sometimes never fires "end". Never wait longer than the sentence could take,
    // or recognition would stay paused and the answer would not be heard.
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
    utterance.rate = 0.9 // a little slower: easier to follow when stressed
    const voice = pickVoice(languageTag)
    if (voice) utterance.voice = voice
    utterance.onend = done
    utterance.onerror = done
    window.speechSynthesis.cancel() // never queue behind an older sentence
    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window)
    window.speechSynthesis.cancel()
}

function pickVoice(languageTag: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const language = languageTag.split("-")[0]
  return (
    voices.find((voice) => voice.lang === languageTag) ??
    voices.find((voice) => voice.lang.startsWith(language))
  )
}
