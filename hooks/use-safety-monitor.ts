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
 * Flow: trigger -> (speech triggers only) transcribe + classify the snippet
 * on the server; a confident "not an incident" is logged and dropped, and any
 * failure falls through -> say the question (recognition paused so we never
 * hear ourselves) -> listen for the answer or a button press -> "fine"
 * cancels, "help" or 30 s of silence escalates.
 *
 * The server is told about the incident as soon as the question is asked, and
 * gets the answer when it comes, so it can escalate by itself if this tab
 * dies mid-question. After escalating, the screen shows who is handling it.
 */
import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react"

import { useAudioCapture } from "@/hooks/use-audio-capture"
import { useSoundTriggers } from "@/hooks/use-sound-triggers"
import { speak, stopSpeaking } from "@/lib/audio/speak"
import { createWebSpeechListener, type SpeechListener, type SpeechListenerStatus } from "@/lib/audio/speech-listener"
import { checkIncident } from "@/lib/client/check-incident"
import { getIncidentStatus, reportIncident, sendAnswer, type IncidentStatusView } from "@/lib/client/safety-api"
import { createStoredValue } from "@/lib/client/stored-value"
import { interpretReply } from "@/lib/safety/confirmation"
import { getIncident, SNOOZE_AFTER_CANCEL_MS } from "@/lib/safety/incidents"
import { matchPhrase, needsAiCheck, pickMostSevere } from "@/lib/safety/match-trigger"
import { initialMonitorState, monitorReducer } from "@/lib/safety/monitor-machine"
import { OUTCOME_LINES, REPLY_HINT, SERVER_OUTCOME_LINES, SPEECH_LANGUAGE_TAGS } from "@/lib/safety/region"
import type { Classification } from "@/lib/safety/schemas"
import type { IncidentTypeId, Language, ReplyIntent, TriggerMatch } from "@/lib/safety/types"

/** Interim speech results repeat; report the same spoken incident at most this often. */
const PHRASE_COOLDOWN_MS = 10_000
const RESUME_AFTER_CANCEL_MS = 4000
const STATUS_POLL_MS = 10_000

type CheckedSnippet = { snippet: { samples: Float32Array; sampleRate: number }; transcript: string; classification: Classification }

/** Remembered in this browser only. The device token is what lets this tab call the server. */
const languageStore = createStoredValue<Language>("safety-monitor-language", "en", (value): value is Language => value === "en" || value === "ar")
const deviceTokenStore = createStoredValue<string>("safety-monitor-device-token", "", (value): value is string => value.length > 0)

export type DialogueLine = { id: number; role: "user" | "alexa"; text: string }

export type Detection = { id: string; atMs: number; match: TriggerMatch; note?: string }

export function useSafetyMonitor() {
  const audio = useAudioCapture()
  const [state, dispatch] = useReducer(monitorReducer, initialMonitorState)
  const language = useSyncExternalStore(languageStore.subscribe, languageStore.read, languageStore.readOnServer)
  const deviceToken = useSyncExternalStore(deviceTokenStore.subscribe, deviceTokenStore.read, deviceTokenStore.readOnServer)
  const [speechStatus, setSpeechStatus] = useState<SpeechListenerStatus>("off")
  const [lastHeard, setLastHeard] = useState("")
  const [dialogue, setDialogue] = useState<DialogueLine[]>([])
  const [detections, setDetections] = useState<Detection[]>([])

  const stateRef = useRef(state)
  const languageRef = useRef(language)
  const listenerRef = useRef<SpeechListener | null>(null)
  const snoozedUntil = useRef(new Map<IncidentTypeId, number>())
  const lastPhraseTrigger = useRef(new Map<IncidentTypeId, number>())
  const nextLineId = useRef(1)
  /** AI check results, reused when reporting the incident (keyed by the incident's startedAtMs). */
  const checkedSnippets = useRef(new Map<number, CheckedSnippet>())
  /** Server ids of incidents reported but not yet answered (keyed by startedAtMs). */
  const unansweredOnServer = useRef(new Map<number, Promise<string | null>>())
  const [escalatedServerId, setEscalatedServerId] = useState<string | null>(null)
  const [serverStatus, setServerStatus] = useState<IncidentStatusView | null>(null)

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

  const { captureSnippet } = audio
  const handleTrigger = useCallback(
    (match: TriggerMatch, options: { simulated?: boolean } = {}) => {
      const nowMs = Date.now()
      if ((snoozedUntil.current.get(match.incidentId) ?? 0) > nowMs) return
      const detectionId = `${nowMs}-${match.incidentId}`
      setDetections((current) => [{ id: detectionId, atMs: nowMs, match }, ...current].slice(0, 8))
      const note = (text: string) =>
        setDetections((current) => current.map((detection) => (detection.id === detectionId ? { ...detection, note: text } : detection)))

      const token = deviceTokenStore.read()
      const runAiCheck = !options.simulated && needsAiCheck(match) && token !== ""
      dispatch({ type: "trigger", match, needsAiCheck: runAiCheck, nowMs })
      if (!runAiCheck) return

      void (async () => {
        const snippet = await captureSnippet()
        const result = snippet ? await checkIncident({ ...snippet, trigger: match, language: languageRef.current, deviceToken: token }) : null
        // Only answer for this trigger: a more severe one may have taken over meanwhile.
        const current = stateRef.current
        if (current.phase !== "checking" || current.incident.startedAtMs !== nowMs) return
        if (!result) {
          note("AI check unavailable, asked anyway")
          dispatch({ type: "ai-check-failed", nowMs: Date.now() })
          return
        }
        if (snippet) checkedSnippets.current.set(nowMs, { snippet, transcript: result.transcript, classification: result.classification })
        const heard = result.transcript ? `“${result.transcript}”` : "no speech"
        note(result.isIncident ? `Checked (${heard}), asking` : `Checked (${heard}), not an incident`)
        dispatch({ type: "ai-check-done", isIncident: result.isIncident, nowMs: Date.now() })
      })()
    },
    [captureSnippet],
  )

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
  const onSoundTrigger = useCallback((match: TriggerMatch) => handleTrigger(match), [handleTrigger])
  const sounds = useSoundTriggers({ listening, onChunk: audio.onChunk, onTrigger: onSoundTrigger })

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

  // Tell the server as soon as the question is asked (once per incident).
  const reportKey = state.phase === "confirming" ? state.incident.startedAtMs : null
  useEffect(() => {
    const current = stateRef.current
    const token = deviceTokenStore.read()
    if (current.phase !== "confirming" || !token) return
    const { incident, deadlineMs } = current
    const checked = checkedSnippets.current.get(incident.startedAtMs)
    checkedSnippets.current.delete(incident.startedAtMs)
    const reported = (async () => {
      const snippet = checked?.snippet ?? (await captureSnippet())
      return reportIncident(
        {
          trigger: incident.trigger,
          language: languageRef.current,
          secondsLeft: (deadlineMs - Date.now()) / 1000,
          snippet,
          transcript: checked?.transcript ?? null,
          classification: checked?.classification ?? null,
        },
        token,
      )
    })()
    unansweredOnServer.current.set(incident.startedAtMs, reported)
  }, [reportKey, captureSnippet])

  // Send the outcome to the server. It also settles any incident a more severe one took over from.
  useEffect(() => {
    const current = stateRef.current
    const token = deviceTokenStore.read()
    if ((current.phase !== "cancelled" && current.phase !== "escalated") || !token) return
    const answer = current.phase === "cancelled" ? "fine" : current.reason === "asked-for-help" ? "help" : "no-answer"
    const ownReport = unansweredOnServer.current.get(current.incident.startedAtMs)
    for (const reported of unansweredOnServer.current.values()) {
      void reported.then((id) => {
        if (id) void sendAnswer(id, answer, token)
      })
    }
    unansweredOnServer.current.clear()
    if (current.phase === "escalated") void ownReport?.then((id) => setEscalatedServerId(id))
  }, [outcomeKey])

  // While escalated, show who is handling it, or that nobody answered.
  useEffect(() => {
    if (state.phase !== "escalated" || !escalatedServerId) return
    const token = deviceTokenStore.read()
    let lastSpoken = ""
    const poll = async () => {
      const status = await getIncidentStatus(escalatedServerId, token)
      if (!status) return
      setServerStatus(status)
      const line =
        status.status === "acknowledged"
          ? SERVER_OUTCOME_LINES.acknowledged(status.acknowledgedBy ?? "")[languageRef.current]
          : status.status === "unacknowledged"
            ? SERVER_OUTCOME_LINES.unacknowledged[languageRef.current]
            : ""
      if (line && line !== lastSpoken) {
        lastSpoken = line
        void say(line)
      }
    }
    void poll()
    const timer = setInterval(poll, STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [state.phase, escalatedServerId, say])

  const resume = useCallback(() => {
    setEscalatedServerId(null)
    setServerStatus(null)
    dispatch({ type: "resume" })
  }, [])

  const stop = useCallback(() => {
    stopSpeaking()
    audio.stop()
  }, [audio])

  /** For the on-screen buttons, and for testing without speaking. */
  const answer = useCallback((intent: ReplyIntent) => dispatch({ type: "reply", intent, nowMs: Date.now() }), [])

  return {
    audio,
    state,
    language,
    setLanguage: languageStore.write,
    deviceToken,
    setDeviceToken: deviceTokenStore.write,
    serverStatus,
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
    simulate: (match: TriggerMatch) => handleTrigger(match, { simulated: true }),
  }
}
