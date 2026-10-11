/*
 * Continuous speech recognition with the Web Speech API, behind a small
 * interface. Chrome ends a recognition session after silence or a network
 * error, so the listener restarts it and ignores events from stale sessions.
 *
 * Chrome supports Arabic (ar-SA) and English without a download, but sends
 * audio to Google for recognition while listening. The interface allows an
 * on-device engine (for example Vosk) to replace it.
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

/**
 * Chrome ends a session after a pause in speech; restart at once so no words are lost.
 * After an error (e.g. network), wait a little so an outage does not cause a tight loop.
 */
const RESTART_AFTER_END_MS = 0
const RESTART_AFTER_ERROR_MS = 1000

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
    let failed = false
    instance.onerror = (event) => {
      failed = event.error !== "no-speech" && event.error !== "aborted"
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        wanted = false
        onStatus("blocked")
      }
    }
    instance.onend = () => {
      // Events from a session we already stopped (pause, stop, language change) must not
      // touch the current one; otherwise two sessions fight and recognition silently stops.
      if (recognition !== instance) return
      recognition = null
      clearTimeout(restartTimer)
      restartTimer = setTimeout(
        launch,
        failed ? RESTART_AFTER_ERROR_MS : RESTART_AFTER_END_MS
      )
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
