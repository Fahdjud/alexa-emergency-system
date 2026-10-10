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
  sendTestAlert,
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

export type TestStepId = "microphone" | "voice" | "speech" | "contacts"
export type TestStep = {
  status: "waiting" | "running" | "ok" | "warn" | "failed" | "skipped"
  note: string
}
/** "Test the system": each check and how it went. */
export type SystemTest = {
  running: boolean
  steps: Record<TestStepId, TestStep>
}

/** How long the test waits for a spoken answer, and for a contact to tap a button. */
const TEST_REPLY_MS = 20_000
const TEST_CONTACT_MS = 3 * 60_000
const TEST_POLL_MS = 4000

const RESPONSE_LABELS = {
  "on-my-way": "On my way",
  calling: "Calling now",
  handling: "I'm handling it",
} as const

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
  const [systemTest, setSystemTest] = useState<SystemTest | null>(null)
  /** While a test runs, speech is its answer, never a trigger. */
  const testRunning = useRef(false)
  const testReply = useRef<
    ((reply: { text: string; intent: ReplyIntent } | null) => void) | null
  >(null)
  /** Bumped to cancel a running test. */
  const testRun = useRef(0)
  const audioStatusRef = useRef(audio.status)
  const speechStatusRef = useRef<SpeechListenerStatus>("off")
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
      if (testRunning.current) {
        if (!isFinal || !testReply.current) return
        const intent = interpretReply(text)
        if (intent !== "unclear") testReply.current({ text, intent })
        return
      }
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
      const name = status.acknowledgedBy ?? ""
      const line =
        status.status === "acknowledged"
          ? status.response === "on-my-way"
            ? lines.onTheWay(name)
            : status.response === "calling"
              ? lines.calling(name)
              : lines.handling(name)
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

  useEffect(() => {
    audioStatusRef.current = audio.status
    speechStatusRef.current = speechStatus
  }, [audio.status, speechStatus])

  const { start: startAudio } = audio
  /**
   * "Test the system": checks the microphone, the voice, speech recognition
   * and (optionally) that contacts get a TEST alert and their answer is heard
   * here. Only runs while no real alert is in progress.
   */
  const runTest = useCallback(
    async ({ withContacts }: { withContacts: boolean }) => {
      const phase = stateRef.current.phase
      if (testRunning.current || (phase !== "idle" && phase !== "listening"))
        return
      const run = ++testRun.current
      const alive = () => testRun.current === run
      const update = (
        id: TestStepId,
        status: TestStep["status"],
        note = ""
      ) => {
        if (!alive()) return
        setSystemTest((test) =>
          test
            ? { ...test, steps: { ...test.steps, [id]: { status, note } } }
            : test
        )
      }
      const waiting: TestStep = { status: "waiting", note: "" }
      setSystemTest({
        running: true,
        steps: {
          microphone: waiting,
          voice: waiting,
          speech: waiting,
          contacts: withContacts
            ? waiting
            : { status: "skipped", note: "Not sent this time." },
        },
      })
      testRunning.current = true

      try {
        update("microphone", "running", "Turning on the microphone…")
        if (audioStatusRef.current !== "on") await startAudio()
        await waitFor(
          () => ["on", "error"].includes(audioStatusRef.current),
          5000
        )
        if (!alive()) return
        if (audioStatusRef.current !== "on") {
          update(
            "microphone",
            "failed",
            "The microphone did not start. Allow microphone access for this site in Chrome, then try again."
          )
          for (const id of ["voice", "speech", "contacts"] as const)
            update(id, "skipped", "Needs the microphone.")
          return
        }
        update("microphone", "ok", "The microphone is on.")

        const language = languageRef.current
        const lines = languagePack(language).lines
        update("voice", "running", "Speaking…")
        await waitFor(() => speechStatusRef.current !== "off", 5000)
        await say(
          `${lines.test} ${getIncident("fall").confirmationQuestion[language]} ${lines.replyHint}`
        )
        if (!alive()) return
        update(
          "voice",
          "ok",
          "The question was spoken. If you did not hear it, turn the volume up."
        )

        if (speechStatusRef.current !== "on") {
          update(
            "speech",
            "failed",
            speechStatusRef.current === "unsupported"
              ? "This browser cannot recognise speech. Use Chrome."
              : "Speech recognition did not start. Allow the microphone, use Chrome, and check the internet connection."
          )
        } else {
          update(
            "speech",
            "running",
            "Answer out loud now, for example “I'm fine”."
          )
          const reply = await new Promise<{
            text: string
            intent: ReplyIntent
          } | null>((resolve) => {
            testReply.current = resolve
            setTimeout(() => resolve(null), TEST_REPLY_MS)
          })
          testReply.current = null
          if (!alive()) return
          if (reply) {
            update(
              "speech",
              "ok",
              `Heard “${reply.text}”, understood as ${reply.intent === "fine" ? "“I'm fine”" : "“help”"}.`
            )
            await say(lines.testHeard)
          } else {
            update(
              "speech",
              "failed",
              "Nothing was understood in 20 seconds. Check the language switch matches what you speak, move closer, and try again."
            )
          }
        }

        if (!withContacts || !alive()) return
        update("contacts", "running", "Sending a TEST alert to your contacts…")
        const token = deviceTokenStore.read()
        const sent = await sendTestAlert(language, token)
        if (!alive()) return
        if ("error" in sent) return update("contacts", "failed", sent.error)
        const reached = [...sent.sentTo, ...(sent.emailed ? ["email"] : [])]
        if (reached.length === 0)
          return update(
            "contacts",
            "failed",
            "No contact is connected yet. Open Settings → Contacts and send the invites."
          )
        update(
          "contacts",
          "running",
          `Sent to ${reached.join(", ")}. Ask one of them to tap a button in the TEST message…`
        )
        const deadline = Date.now() + TEST_CONTACT_MS
        while (alive() && Date.now() < deadline) {
          await sleep(TEST_POLL_MS)
          const status = await getIncidentStatus(sent.id, token)
          if (!alive() || status?.status !== "acknowledged") continue
          const name = status.acknowledgedBy ?? "A contact"
          const response = status.response ?? "handling"
          await say(
            response === "on-my-way"
              ? lines.onTheWay(name)
              : response === "calling"
                ? lines.calling(name)
                : lines.handling(name)
          )
          return update(
            "contacts",
            "ok",
            `${name} answered “${RESPONSE_LABELS[response]}”, and it was spoken here.`
          )
        }
        update(
          "contacts",
          "warn",
          `Sent to ${reached.join(", ")}, but nobody answered within 3 minutes. Check they received it.`
        )
      } finally {
        if (alive()) {
          testRunning.current = false
          testReply.current = null
          setSystemTest((test) => (test ? { ...test, running: false } : test))
        }
      }
    },
    [say, startAudio]
  )

  /** Stops a running test and hides the results. */
  const closeTest = useCallback(() => {
    testRun.current++
    testRunning.current = false
    testReply.current?.(null)
    testReply.current = null
    setSystemTest(null)
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
    systemTest,
    runTest,
    closeTest,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Resolves when the condition holds or the time runs out (whichever is first). */
async function waitFor(condition: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (!condition() && Date.now() < deadline) await sleep(100)
}
