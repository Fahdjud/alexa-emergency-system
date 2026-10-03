/*
 * use-safety-monitor.ts: the monitor's brain on the client. It connects the
 * microphone, the sound classifier, speech recognition and the voice
 * confirmation to the state machine in lib/safety/monitor-machine.ts.
 *
 * Why this file exists: each piece (capture, classifier, speech, matching,
 * reply parsing, state machine) is small and separate. This hook is the one
 * place that wires them together, so the screen only renders state and calls
 * actions.
 *
 * Flow: trigger -> say the question (recognition paused so we never hear
 * ourselves) -> listen for the answer or a button press -> "fine" cancels,
 * "help" or 30 s of silence escalates.
 */
import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react"

import { useAudioCapture } from "@/hooks/use-audio-capture"
import { useSoundTriggers } from "@/hooks/use-sound-triggers"
import { speak, stopSpeaking } from "@/lib/audio/speak"
import { createWebSpeechListener, type SpeechListener, type SpeechListenerStatus } from "@/lib/audio/speech-listener"
import { interpretReply } from "@/lib/safety/confirmation"
import { getIncident, SNOOZE_AFTER_CANCEL_MS } from "@/lib/safety/incidents"
import { matchPhrase, pickMostSevere } from "@/lib/safety/match-trigger"
import { initialMonitorState, monitorReducer } from "@/lib/safety/monitor-machine"
import { OUTCOME_LINES, REPLY_HINT, SPEECH_LANGUAGE_TAGS } from "@/lib/safety/region"
import type { IncidentTypeId, Language, ReplyIntent, TriggerMatch } from "@/lib/safety/types"

/** Interim speech results repeat; report the same spoken incident at most this often. */
const PHRASE_COOLDOWN_MS = 10_000
const RESUME_AFTER_CANCEL_MS = 4000
const LANGUAGE_STORAGE_KEY = "safety-monitor-language"

export type DialogueLine = { id: number; role: "user" | "alexa"; text: string }

export function useSafetyMonitor() {
  const audio = useAudioCapture()
  const [state, dispatch] = useReducer(monitorReducer, initialMonitorState)
  const language = useSyncExternalStore(subscribeToLanguage, readStoredLanguage, () => DEFAULT_LANGUAGE)
  const [speechStatus, setSpeechStatus] = useState<SpeechListenerStatus>("off")
  const [lastHeard, setLastHeard] = useState("")
  const [dialogue, setDialogue] = useState<DialogueLine[]>([])
  const [detections, setDetections] = useState<{ id: string; atMs: number; match: TriggerMatch }[]>([])

  const stateRef = useRef(state)
  const languageRef = useRef(language)
  const listenerRef = useRef<SpeechListener | null>(null)
  const snoozedUntil = useRef(new Map<IncidentTypeId, number>())
  const lastPhraseTrigger = useRef(new Map<IncidentTypeId, number>())
  const nextLineId = useRef(1)

  useEffect(() => {
    stateRef.current = state
    languageRef.current = language
  }, [state, language])

  const addLine = useCallback((role: DialogueLine["role"], text: string) => {
    const id = nextLineId.current++
    // First-strong isolate: lets the shared chat component show Arabic right-to-left without changing it.
    const isolated = `\u2068${text}\u2069`
    setDialogue((current) => [...current, { id, role, text: isolated }].slice(-30))
  }, [])

  const handleTrigger = useCallback((match: TriggerMatch) => {
    const nowMs = Date.now()
    if ((snoozedUntil.current.get(match.incidentId) ?? 0) > nowMs) return
    setDetections((current) => [{ id: `${nowMs}-${match.incidentId}`, atMs: nowMs, match }, ...current].slice(0, 8))
    // The AI check arrives with the server step; until then every trigger goes straight to the question.
    dispatch({ type: "trigger", match, needsAiCheck: false, nowMs })
  }, [])

  const handleTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      setLastHeard(text)
      const nowMs = Date.now()

      if (stateRef.current.phase === "confirming") {
        if (!isFinal) return
        addLine("user", text)
        dispatch({ type: "reply", intent: interpretReply(text), nowMs })
        return
      }

      const match = pickMostSevere(matchPhrase(text, languageRef.current))
      if (!match) return
      if (nowMs - (lastPhraseTrigger.current.get(match.incidentId) ?? 0) < PHRASE_COOLDOWN_MS) return
      lastPhraseTrigger.current.set(match.incidentId, nowMs)
      handleTrigger(match)
    },
    [addLine, handleTrigger],
  )

  const listening = audio.status === "on"
  const sounds = useSoundTriggers({ listening, onChunk: audio.onChunk, onTrigger: handleTrigger })

  // Keep the state machine in step with the microphone.
  useEffect(() => {
    if (listening && state.phase === "idle") dispatch({ type: "start" })
    if (!listening && state.phase !== "idle") dispatch({ type: "stop" })
  }, [listening, state.phase])

  // Speech recognition runs while the microphone is on, in the chosen language.
  useEffect(() => {
    if (!listening) return
    const listener = createWebSpeechListener({
      languageTag: SPEECH_LANGUAGE_TAGS[language],
      onTranscript: handleTranscript,
      onStatus: setSpeechStatus,
    })
    listenerRef.current = listener
    listener.start()
    return () => {
      listener.stop()
      listenerRef.current = null
    }
  }, [listening, language, handleTranscript])

  // Say something with recognition paused, so the device never answers its own question.
  const say = useCallback(
    async (text: string) => {
      addLine("alexa", text)
      listenerRef.current?.pause()
      await speak(text, SPEECH_LANGUAGE_TAGS[languageRef.current])
      listenerRef.current?.resume()
    },
    [addLine],
  )

  // Ask (and re-ask after an unclear answer).
  const askKey = state.phase === "confirming" ? `${state.incident.startedAtMs}-${state.timesAsked}` : ""
  useEffect(() => {
    const current = stateRef.current
    if (current.phase !== "confirming") return
    const lang = languageRef.current
    void say(`${getIncident(current.incident.incidentId).confirmationQuestion[lang]} ${REPLY_HINT[lang]}`)
  }, [askKey, say])

  // Count down while waiting for an answer.
  useEffect(() => {
    if (state.phase !== "confirming") return
    const timer = setInterval(() => dispatch({ type: "tick", nowMs: Date.now() }), 1000)
    return () => clearInterval(timer)
  }, [state.phase])

  // React to the outcome.
  const outcomeKey = state.phase === "cancelled" || state.phase === "escalated" ? `${state.phase}-${state.atMs}` : ""
  useEffect(() => {
    const current = stateRef.current
    if (current.phase === "cancelled") {
      snoozedUntil.current.set(current.incident.incidentId, current.atMs + SNOOZE_AFTER_CANCEL_MS)
      void say(OUTCOME_LINES.cancelled[languageRef.current])
      const timer = setTimeout(() => dispatch({ type: "resume" }), RESUME_AFTER_CANCEL_MS)
      return () => clearTimeout(timer)
    }
    if (current.phase === "escalated") void say(OUTCOME_LINES.escalated[languageRef.current])
  }, [outcomeKey, say])

  const stop = useCallback(() => {
    stopSpeaking()
    audio.stop()
  }, [audio])

  /** For the on-screen buttons, and for testing without speaking. */
  const answer = useCallback((intent: ReplyIntent) => dispatch({ type: "reply", intent, nowMs: Date.now() }), [])
  const resume = useCallback(() => dispatch({ type: "resume" }), [])

  return {
    audio,
    state,
    language,
    setLanguage: storeLanguage,
    soundStatus: sounds.status,
    hearing: sounds.hearing,
    speechStatus: listening ? speechStatus : "off",
    lastHeard,
    dialogue,
    detections,
    start: audio.start,
    stop,
    answer,
    resume,
    simulate: handleTrigger,
  }
}

// The chosen language is remembered in this browser. Kept outside React state so it survives reloads
// and the server render (which cannot see localStorage) always starts in the default language.
const DEFAULT_LANGUAGE: Language = "en"
const languageListeners = new Set<() => void>()
let languageFallback: Language = DEFAULT_LANGUAGE // used when storage is unavailable (private window)

function subscribeToLanguage(listener: () => void) {
  languageListeners.add(listener)
  return () => {
    languageListeners.delete(listener)
  }
}

function readStoredLanguage(): Language {
  try {
    const value = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return value === "en" || value === "ar" ? value : languageFallback
  } catch {
    return languageFallback
  }
}

function storeLanguage(language: Language) {
  languageFallback = language
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Not remembered after a reload, but still applied now.
  }
  languageListeners.forEach((listener) => listener())
}
