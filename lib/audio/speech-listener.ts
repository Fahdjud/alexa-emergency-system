/*
 * speech-listener.ts: the SpeechListener interface, plus an implementation
 * with the browser's Web Speech API that listens continuously and reports
 * what it hears.
 *
 * Why this file exists: the demo's voice input (components/alexa/
 * alexa-assistant.tsx) recognises one sentence after a button press and
 * keeps its types private. Monitoring needs recognition that never stops:
 * Chrome ends a session after silence or a network blip, so this restarts it.
 *
 * Choice: Web Speech in Chrome supports Arabic (ar-SA) and English with no
 * download. Trade-off: Chrome sends the audio to Google for recognition while
 * listening. It is not stored by us. The interface lets an on-device engine
 * (e.g. Vosk) replace it later.
 */

export type SpeechListenerStatus = "off" | "on" | "unsupported" | "blocked"

export interface SpeechListener {
  start(): void
  stop(): void
  /** Stops recognising without changing status, e.g. while the device itself speaks. */
  pause(): void
  resume(): void
}

type Options = {
  languageTag: string
  onTranscript: (text: string, isFinal: boolean) => void
  onStatus: (status: SpeechListenerStatus) => void
}

/** Wait before restarting after an error, so a network outage does not cause a tight loop. */
const RESTART_DELAY_MS = 1000

export function createWebSpeechListener({
  languageTag,
  onTranscript,
  onStatus,
}: Options): SpeechListener {
  const MaybeRecognition = getRecognitionConstructor()
  if (!MaybeRecognition) {
    onStatus("unsupported")
    return { start() {}, stop() {}, pause() {}, resume() {} }
  }
  const Recognition = MaybeRecognition

  let wanted = false // the caller wants recognition running
  let paused = false
  let recognition: RecognitionInstance | null = null
  let restartTimer: ReturnType<typeof setTimeout> | undefined

  function launch() {
    if (!wanted || paused || recognition) return
    const instance = new Recognition()
    instance.lang = languageTag
    instance.continuous = true
    instance.interimResults = true
    instance.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript.trim()
        if (text) onTranscript(text, result.isFinal)
      }
    }
    instance.onerror = (event) => {
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        wanted = false
        onStatus("blocked")
      }
    }
    instance.onend = () => {
      recognition = null
      clearTimeout(restartTimer)
      restartTimer = setTimeout(launch, RESTART_DELAY_MS)
    }
    recognition = instance
    try {
      instance.start()
    } catch {
      recognition = null
    }
  }

  function halt() {
    clearTimeout(restartTimer)
    recognition?.abort()
    recognition = null
  }

  return {
    start() {
      wanted = true
      onStatus("on")
      launch()
    },
    stop() {
      wanted = false
      halt()
      onStatus("off")
    },
    pause() {
      paused = true
      halt()
    },
    resume() {
      paused = false
      launch()
    },
  }
}

// Minimal Web Speech types: TypeScript's DOM library does not include them.
type RecognitionResultEvent = {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

type RecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

function getRecognitionConstructor():
  (new () => RecognitionInstance) | undefined {
  const speechWindow = window as Window & {
    SpeechRecognition?: new () => RecognitionInstance
    webkitSpeechRecognition?: new () => RecognitionInstance
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}
