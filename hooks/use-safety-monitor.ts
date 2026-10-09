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
 * dies mid-question. After escalating, the monitor goes back to listening on
 * its own (escalation runs on the server) and keeps showing who is handling it.
 *
 * Nothing is dropped silently: a trigger that is ignored (busy, or the same
 * alert paused after "I'm fine") still appears in the detections with why.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import { useAudioCapture } from "@/hooks/use-audio-capture"
import { useSoundTriggers } from "@/hooks/use-sound-triggers"
import { speak, stopSpeaking } from "@/lib/audio/speak"
import {
  createWebSpeechListener,
  type SpeechListener,
  type SpeechListenerStatus,
} from "@/lib/audio/speech-listener"
import { checkIncident } from "@/lib/client/check-incident"
import {
  getIncidentStatus,
  reportIncident,
  sendAnswer,
  sendHeartbeat,
  type IncidentStatusView,
} from "@/lib/client/safety-api"
import {
  DEFAULT_PROFILE,
  deviceTokenStore,
  languageStore,
  parseProfile,
  profileStore,
  saveProfile,
} from "@/lib/client/monitor-settings"
import { interpretReply } from "@/lib/safety/confirmation"
import { getIncident, SNOOZE_AFTER_CANCEL_MS } from "@/lib/safety/incidents"
import {
  matchPhraseInAnyLanguage,
  needsAiCheck,
  pickMostSevere,
} from "@/lib/safety/match-trigger"
import { HEARTBEAT_EVERY_MS } from "@/lib/safety/monitor-health"
import {
  applyProfile,
  dismissThreshold,
  watchesForImpacts,
} from "@/lib/safety/profile"
import {
  initialMonitorState,
  monitorReducer,
  whyTriggerIgnored,
} from "@/lib/safety/monitor-machine"
import { languagePack } from "@/lib/safety/languages"
import type { Classification } from "@/lib/safety/schemas"
import type {
  IncidentTypeId,
  ReplyIntent,
  TriggerMatch,
} from "@/lib/safety/types"

/** Interim speech results repeat; report the same spoken phrase at most this often. */
const PHRASE_COOLDOWN_MS = 10_000
const RESUME_AFTER_CANCEL_MS = 4000
/** After escalating, listen again once the device has finished speaking; the server keeps alerting. */
const RESUME_AFTER_ESCALATION_MS = 10_000
const STATUS_POLL_MS = 10_000

type CheckedSnippet = {
  snippet: { samples: Float32Array; sampleRate: number }
  transcript: string
  classification: Classification
}

export type DialogueLine = { id: number; role: "user" | "alexa"; text: string }

export type ActiveAlert = {
  incidentId: IncidentTypeId
  reason: "asked-for-help" | "no-answer"
  serverId: string | null
}

export type Detection = {
  id: string
  atMs: number
  match: TriggerMatch
  note?: string
}

export function useSafetyMonitor() {
  const audio = useAudioCapture()
  const [state, dispatch] = useReducer(monitorReducer, initialMonitorState)
  const language = useSyncExternalStore(
    languageStore.subscribe,
    languageStore.read,
    languageStore.readOnServer
  )
  const deviceToken = useSyncExternalStore(
    deviceTokenStore.subscribe,
    deviceTokenStore.read,
    deviceTokenStore.readOnServer
  )
  const profileJson = useSyncExternalStore(
    profileStore.subscribe,
    profileStore.read,
    profileStore.readOnServer
  )
  /** null until setup is finished; detection then uses the defaults. */
  const profile = useMemo(() => parseProfile(profileJson), [profileJson])
  const activeProfile = profile ?? DEFAULT_PROFILE
  const incidents = useMemo(() => applyProfile(activeProfile), [activeProfile])
  const incidentsRef = useRef(incidents)
  const carefulnessRef = useRef(activeProfile.carefulness)
  const [speechStatus, setSpeechStatus] = useState<SpeechListenerStatus>("off")
  const [lastHeard, setLastHeard] = useState("")
  const [dialogue, setDialogue] = useState<DialogueLine[]>([])
  const [detections, setDetections] = useState<Detection[]>([])

  const stateRef = useRef(state)
  const languageRef = useRef(language)
  const listenerRef = useRef<SpeechListener | null>(null)
  /** Alerts paused after an outcome, so one ongoing situation does not ask again and again. */
  const snoozed = useRef(
    new Map<IncidentTypeId, { untilMs: number; why: "fine" | "alerting" }>()
  )
  /** Last time each spoken phrase triggered (keyed by incident + phrase). */
  const lastPhraseTrigger = useRef(new Map<string, number>())
  const nextLineId = useRef(1)
  /** AI check results, reused when reporting the incident (keyed by the incident's startedAtMs). */
  const checkedSnippets = useRef(new Map<number, CheckedSnippet>())
  /** Server ids of incidents reported but not yet answered (keyed by startedAtMs). */
  const unansweredOnServer = useRef(new Map<number, Promise<string | null>>())
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null)
  const [serverStatus, setServerStatus] = useState<IncidentStatusView | null>(
    null
  )

  useEffect(() => {
    stateRef.current = state
    languageRef.current = language
    incidentsRef.current = incidents
    carefulnessRef.current = activeProfile.carefulness
  }, [state, language, incidents, activeProfile.carefulness])

  const addLine = useCallback((role: DialogueLine["role"], text: string) => {
    const id = nextLineId.current++
    // First-strong isolate: lets the shared chat component show Arabic right-to-left without changing it.
    const isolated = `\u2068${text}\u2069`
    setDialogue((current) =>
      [...current, { id, role, text: isolated }].slice(-30)
    )
  }, [])

  const { captureSnippet } = audio
  const handleTrigger = useCallback(
    (match: TriggerMatch) => {
      const nowMs = Date.now()
      const detectionId = `${nowMs}-${match.incidentId}`
      const record = (note?: string) =>
        setDetections((current) =>
          [{ id: detectionId, atMs: nowMs, match, note }, ...current].slice(
            0,
            8
          )
        )

      const snooze = snoozed.current.get(match.incidentId)
      const snoozedForMs = (snooze?.untilMs ?? 0) - nowMs
      if (snooze && snoozedForMs > 0) {
        const why =
          snooze.why === "fine"
            ? "you said you're fine"
            : "contacts are already being alerted about this"
        record(
          `Ignored: ${why}, so this alert is paused for ${Math.ceil(snoozedForMs / 1000)} s`
        )
        return
      }
      const ignored = whyTriggerIgnored(stateRef.current, match)
      if (ignored) {
        record(`Ignored: ${ignored}`)
        return
      }
      record()
      const note = (text: string) =>
        setDetections((current) =>
          current.map((detection) =>
            detection.id === detectionId
              ? { ...detection, note: text }
              : detection
          )
        )

      const token = deviceTokenStore.read()
      const dismissAt = dismissThreshold(carefulnessRef.current)
      const runAiCheck =
        dismissAt !== null &&
        needsAiCheck(match, incidentsRef.current) &&
        token !== ""
      dispatch({ type: "trigger", match, needsAiCheck: runAiCheck, nowMs })
      if (!runAiCheck) return

      void (async () => {
        const snippet = await captureSnippet()
        const result = snippet
          ? await checkIncident({
              ...snippet,
              trigger: match,
              language: languageRef.current,
              dismissAt: dismissAt ?? 1,
              deviceToken: token,
            })
          : null
        // Only answer for this trigger: a more severe one may have taken over meanwhile.
        const current = stateRef.current
        if (
          current.phase !== "checking" ||
          current.incident.startedAtMs !== nowMs
        )
          return
        if (!result) {
          note("AI check unavailable, asked anyway")
          dispatch({ type: "ai-check-failed", nowMs: Date.now() })
          return
        }
        if (snippet)
          checkedSnippets.current.set(nowMs, {
            snippet,
            transcript: result.transcript,
            classification: result.classification,
          })
        const heard = result.transcript ? `“${result.transcript}”` : "no speech"
        note(
          result.isIncident
            ? `Checked (${heard}), asking`
            : `Checked (${heard}), not an incident`
        )
        dispatch({
          type: "ai-check-done",
          isIncident: result.isIncident,
          nowMs: Date.now(),
        })
      })()
    },
    [captureSnippet]
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

      const match = pickMostSevere(
        matchPhraseInAnyLanguage(text, incidentsRef.current)
      )
      if (match?.source !== "speech") return
      // Chrome repeats partial results of the same words; a different phrase always counts.
      const key = `${match.incidentId}:${match.phrase}`
      if (
        nowMs - (lastPhraseTrigger.current.get(key) ?? 0) <
        PHRASE_COOLDOWN_MS
      )
        return
      lastPhraseTrigger.current.set(key, nowMs)
      handleTrigger(match)
    },
    [addLine, handleTrigger]
  )

  const listening = audio.status === "on"
  const sounds = useSoundTriggers({
    listening,
    onChunk: audio.onChunk,
    onTrigger: handleTrigger,
    incidents,
    detectImpacts: watchesForImpacts(activeProfile),
  })

  // Keep the state machine in step with the microphone.
  useEffect(() => {
    if (listening && state.phase === "idle") dispatch({ type: "start" })
    if (!listening && state.phase !== "idle") dispatch({ type: "stop" })
  }, [listening, state.phase])

  // Speech recognition runs while the microphone is on, in the chosen language.
  useEffect(() => {
    if (!listening) return
    const listener = createWebSpeechListener({
      languageTag: languagePack(language).speechTag,
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
      await speak(text, languagePack(languageRef.current).speechTag)
      listenerRef.current?.resume()
    },
    [addLine]
  )

  // Ask (and re-ask after an unclear answer).
  const askKey =
    state.phase === "confirming"
      ? `${state.incident.startedAtMs}-${state.timesAsked}`
      : ""
  useEffect(() => {
    const current = stateRef.current
    if (current.phase !== "confirming") return
    const lang = languageRef.current
    void say(
      `${getIncident(current.incident.incidentId).confirmationQuestion[lang]} ${languagePack(lang).lines.replyHint}`
    )
  }, [askKey, say])

  // Count down while waiting for an answer.
  useEffect(() => {
    if (state.phase !== "confirming") return
    const timer = setInterval(
      () => dispatch({ type: "tick", nowMs: Date.now() }),
      1000
    )
    return () => clearInterval(timer)
  }, [state.phase])

  // React to the outcome.
  const outcomeKey =
    state.phase === "cancelled" || state.phase === "escalated"
      ? `${state.phase}-${state.atMs}`
      : ""
  useEffect(() => {
    const current = stateRef.current
    if (current.phase === "cancelled") {
      snoozed.current.set(current.incident.incidentId, {
        untilMs: current.atMs + SNOOZE_AFTER_CANCEL_MS,
        why: "fine",
      })
      void say(languagePack(languageRef.current).lines.cancelled)
      const timer = setTimeout(
        () => dispatch({ type: "resume" }),
        RESUME_AFTER_CANCEL_MS
      )
      return () => clearTimeout(timer)
    }
    if (current.phase === "escalated") {
      const { incidentId } = current.incident
      setActiveAlert({ incidentId, reason: current.reason, serverId: null })
      snoozed.current.set(incidentId, {
        untilMs: current.atMs + SNOOZE_AFTER_CANCEL_MS,
        why: "alerting",
      })
      void say(languagePack(languageRef.current).lines.escalated)
      const timer = setTimeout(
        () => dispatch({ type: "resume" }),
        RESUME_AFTER_ESCALATION_MS
      )
      return () => clearTimeout(timer)
    }
  }, [outcomeKey, say])

  // Tell the server as soon as the question is asked (once per incident).
  const reportKey =
    state.phase === "confirming" ? state.incident.startedAtMs : null
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
        token
      )
    })()
    unansweredOnServer.current.set(incident.startedAtMs, reported)
  }, [reportKey, captureSnippet])

  // Send the outcome to the server. It also settles any incident a more severe one took over from.
  useEffect(() => {
    const current = stateRef.current
    const token = deviceTokenStore.read()
    if (
      (current.phase !== "cancelled" && current.phase !== "escalated") ||
      !token
    )
      return
    const answer =
      current.phase === "cancelled"
        ? "fine"
        : current.reason === "asked-for-help"
          ? "help"
          : "no-answer"
    const ownReport = unansweredOnServer.current.get(
      current.incident.startedAtMs
    )
    for (const reported of unansweredOnServer.current.values()) {
      void reported.then((id) => {
        if (id) void sendAnswer(id, answer, token)
      })
    }
    unansweredOnServer.current.clear()
    if (current.phase === "escalated")
      void ownReport?.then((serverId) =>
        setActiveAlert((alert) => (alert ? { ...alert, serverId } : alert))
      )
  }, [outcomeKey])

  // While an alert is active, show who is handling it, or that nobody answered.
  const escalatedServerId = activeAlert?.serverId ?? null
  useEffect(() => {
    if (!escalatedServerId) return
    const token = deviceTokenStore.read()
    let lastSpoken = ""
    const poll = async () => {
      const status = await getIncidentStatus(escalatedServerId, token)
      if (!status) return
      setServerStatus(status)
      const lines = languagePack(languageRef.current).lines
      const line =
        status.status === "acknowledged"
          ? lines.handling(status.acknowledgedBy ?? "")
          : status.status === "unacknowledged"
            ? lines.unacknowledged
            : ""
      if (line && line !== lastSpoken) {
        lastSpoken = line
        void say(line)
      }
    }
    void poll()
    const timer = setInterval(poll, STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [escalatedServerId, say])

  // Heartbeat: the server tells contact 1 if these stop (tab closed, device off).
  // Stopping on purpose sends one "not listening" beat, so a deliberate pause does not alert anyone.
  useEffect(() => {
    if (!deviceToken) return
    if (!listening) {
      void sendHeartbeat(false, deviceToken)
      return
    }
    void sendHeartbeat(true, deviceToken)
    const timer = setInterval(
      () => void sendHeartbeat(true, deviceToken),
      HEARTBEAT_EVERY_MS
    )
    return () => clearInterval(timer)
  }, [listening, deviceToken])

  /** Hides the alert card. Escalation itself continues on the server until someone acknowledges. */
  const dismissAlert = useCallback(() => {
    setActiveAlert(null)
    setServerStatus(null)
    if (stateRef.current.phase === "escalated") dispatch({ type: "resume" })
  }, [])

  const stop = useCallback(() => {
    stopSpeaking()
    audio.stop()
  }, [audio])

  /** For the on-screen buttons, and for testing without speaking. */
  const answer = useCallback(
    (intent: ReplyIntent) =>
      dispatch({ type: "reply", intent, nowMs: Date.now() }),
    []
  )

  return {
    audio,
    state,
    language,
    setLanguage: languageStore.write,
    deviceToken,
    setDeviceToken: deviceTokenStore.write,
    profile,
    saveProfile,
    serverStatus,
    activeAlert,
    soundStatus: sounds.status,
    hearing: sounds.hearing,
    speechStatus: listening ? speechStatus : "off",
    lastHeard,
    dialogue,
    detections,
    start: audio.start,
    stop,
    answer,
    dismissAlert,
  }
}
