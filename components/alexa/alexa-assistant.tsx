"use client"

import { useEffect, useRef, useState } from "react"
import { AlexaHeader } from "./alexa-header"
import { ConversationThread, WelcomePanel } from "./conversation"
import { getDemoReply, suggestions } from "./data"
import { DevicesPanel } from "./devices-panel"
import { MessageComposer } from "./message-composer"
import type { ChatMessage } from "./types"
import type { EmergencyEvent } from "@/types/emergency"

type SpeechResult = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

type SpeechError = {
  error: string
}

type SpeechRecognitionController = {
  lang: string
  interimResults: boolean
  onstart: (() => void) | null
  onresult: ((event: SpeechResult) => void) | null
  onerror: ((event: SpeechError) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type VoiceState = "idle" | "starting" | "listening" | "processing"

// Recorded Alexa voice prompts (public/audio/alexa). The browser voice reads
// the same text if a recording cannot play. All prompts reuse one audio
// element: iPhones only allow audio started by a tap, but an element that
// played after a tap may keep playing after timers and network replies.
const PROMPT_AUDIO = {
  first_check: "/audio/alexa/check_1.mp3",
  second_check: "/audio/alexa/check_2.mp3",
  reminder: "/audio/alexa/reminder.mp3",
  cancelled: "/audio/alexa/cancelled.mp3",
  sending: "/audio/alexa/sending.mp3",
  published: "/audio/alexa/sent.mp3",
  failed: "/audio/alexa/failed.mp3",
} as const
type EmergencyStage =
  | "idle"
  | "first_check"
  | "second_check"
  | "cancelled"
  | "sending"
  | "published"
  | "failed"

export function AlexaAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [voiceState, setVoiceState] = useState<VoiceState>("idle")
  const [voiceNotice, setVoiceNotice] = useState("")
  const [devicesOpen, setDevicesOpen] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionController | null>(null)
  const [emergencyStage, setEmergencyStage] = useState<EmergencyStage>("idle")
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const emergencyRef = useRef<{
    event: EmergencyEvent
    stage: EmergencyStage
    requestStarted: boolean
  } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const promptAudioRef = useRef<HTMLAudioElement | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messageIdRef = useRef(0)

  function appendMessage(role: ChatMessage["role"], text: string) {
    const id = ++messageIdRef.current
    setMessages((current) => [...current, { id, role, text }])
  }

  function stopPromptAudio() {
    promptAudioRef.current?.pause()
  }

  /** Plays a recorded prompt. Resolves false if it cannot play. */
  function playPromptAudio(
    key: keyof typeof PROMPT_AUDIO,
    onEnd?: () => void
  ): Promise<boolean> {
    if (typeof Audio === "undefined") return Promise.resolve(false)
    promptAudioRef.current ??= new Audio()
    const audio = promptAudioRef.current
    audio.pause()
    audio.onended = onEnd ?? null
    audio.src = PROMPT_AUDIO[key]
    return audio.play().then(
      () => true,
      () => false
    )
  }

  /**
   * Shows an Alexa message and says it: the recording, or the browser voice.
   * Resolves when it has been said (at most 12 seconds).
   */
  function sayMessage(
    key: keyof typeof PROMPT_AUDIO,
    text: string
  ): Promise<void> {
    appendMessage("alexa", text)
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, 12000)
      const done = () => {
        clearTimeout(timeout)
        resolve()
      }
      void playPromptAudio(key, done).then((playing) => {
        if (playing) return
        if (
          !window.speechSynthesis ||
          typeof SpeechSynthesisUtterance === "undefined"
        )
          return done()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.onend = done
        utterance.onerror = done
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utterance)
      })
    })
  }

  function clearEmergencyTimers() {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    timerRef.current = null
    countdownRef.current = null
  }

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      emergencyRef.current = null
      promptAudioRef.current?.pause()
      window.speechSynthesis?.cancel()
    },
    []
  )

  function cancelEmergency() {
    const active = emergencyRef.current
    if (
      !active ||
      !["first_check", "second_check"].includes(active.stage) ||
      active.requestStarted
    )
      return
    // Update the guard before cancelling speech: speech callbacks may run immediately.
    active.stage = "cancelled"
    clearEmergencyTimers()
    stopPromptAudio()
    window.speechSynthesis?.cancel()
    setEmergencyStage("cancelled")
    setSecondsLeft(null)
    void sayMessage(
      "cancelled",
      "Thanks for letting me know. The emergency check is cancelled. No alert was sent."
    )
  }

  async function escalateEmergency(
    active: NonNullable<typeof emergencyRef.current>
  ) {
    if (
      emergencyRef.current !== active ||
      active.stage !== "second_check" ||
      active.requestStarted
    )
      return
    active.requestStarted = true
    active.stage = "sending"
    clearEmergencyTimers()
    setSecondsLeft(null)
    setEmergencyStage("sending")
    // The result is announced after this sentence, so it is never cut off.
    const announced = sayMessage(
      "sending",
      "I didn’t hear an answer, so I’m alerting your trusted contact now."
    )
    try {
      const response = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(active.event),
      })
      const result = await response.json()
      if (
        !response.ok ||
        result.status !== "published" ||
        result.eventId !== active.event.id
      )
        throw new Error("Publish unsuccessful")
      if (emergencyRef.current !== active) return
      active.stage = "published"
      setEmergencyStage("published")
      await announced
      if (emergencyRef.current !== active) return
      void sayMessage(
        "published",
        "I’ve sent an alert to your trusted contact. If you can, call 911 for help."
      )
    } catch {
      if (emergencyRef.current !== active) return
      active.stage = "failed"
      setEmergencyStage("failed")
      await announced
      if (emergencyRef.current !== active) return
      void sayMessage(
        "failed",
        "I couldn’t send the alert. If you can, call 911 for help."
      )
    }
  }

  function startSafetyCheck(
    active: NonNullable<typeof emergencyRef.current>,
    stage: "first_check" | "second_check"
  ) {
    clearEmergencyTimers()
    active.stage = stage
    setEmergencyStage(stage)
    setSecondsLeft(null)
    const prompt =
      stage === "first_check"
        ? "I heard something that may have been a fall. Are you okay?"
        : "Are you okay? Please respond. If I don’t hear from you, I’ll send a possible emergency alert to your trusted contact."
    appendMessage("alexa", prompt)
    let windowStarted = false
    const beginWindow = () => {
      if (
        windowStarted ||
        emergencyRef.current !== active ||
        active.stage !== stage
      )
        return
      windowStarted = true
      clearEmergencyTimers()
      setSecondsLeft(5)
      const deadline = Date.now() + 5000
      countdownRef.current = setInterval(
        () =>
          setSecondsLeft(
            Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
          ),
        250
      )
      timerRef.current = setTimeout(() => {
        if (
          emergencyRef.current !== active ||
          active.stage !== stage ||
          active.requestStarted
        )
          return
        if (stage === "first_check") startSafetyCheck(active, "second_check")
        else void escalateEmergency(active)
      }, 5000)
    }
    const speakWithBrowserVoice = () => {
      if (
        emergencyRef.current !== active ||
        active.stage !== stage ||
        windowStarted
      )
        return
      if (
        window.speechSynthesis &&
        typeof SpeechSynthesisUtterance !== "undefined"
      ) {
        try {
          window.speechSynthesis.cancel()
          const utterance = new SpeechSynthesisUtterance(prompt)
          utterance.onend = beginWindow
          utterance.onerror = beginWindow
          window.speechSynthesis.speak(utterance)
        } catch {
          beginWindow()
        }
      } else beginWindow()
    }
    // Fall back if the prompt never starts or finishes playing.
    timerRef.current = setTimeout(() => {
      beginWindow()
      stopPromptAudio()
      window.speechSynthesis?.cancel()
    }, 15000)
    if (typeof Audio === "undefined") speakWithBrowserVoice()
    else
      void playPromptAudio(stage, beginWindow).then((playing) => {
        if (!playing) speakWithBrowserVoice()
      })
  }

  function simulateFall() {
    if (
      emergencyRef.current &&
      ["first_check", "second_check", "sending"].includes(
        emergencyRef.current.stage
      )
    )
      return
    const active = {
      event: {
        id: crypto.randomUUID(),
        type: "Possible Fall",
        message:
          "Demo simulation: a possible fall was detected, with no response to two safety checks.",
        occurredAt: new Date().toISOString(),
        location: "Demo living room",
      },
      stage: "first_check" as EmergencyStage,
      requestStarted: false,
    }
    emergencyRef.current = active
    appendMessage("user", "Simulate Fall (demo)")
    startSafetyCheck(active, "first_check")
  }

  useEffect(() => () => recognitionRef.current?.stop(), [])

  useEffect(() => {
    if (!devicesOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDevicesOpen(false)
    }

    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [devicesOpen])

  function sendMessage(text = draft) {
    const prompt = text.trim()
    if (!prompt) return

    appendMessage("user", prompt)
    const active = emergencyRef.current
    if (active && ["first_check", "second_check"].includes(active.stage)) {
      const normalized = prompt
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[.!?,]/g, "")
        .trim()
      if (
        /^(im (okay|ok|fine|alright)|i am (okay|ok|fine|alright)|yes|yes im (okay|ok|fine)|yes i am (okay|ok|fine))$/.test(
          normalized
        )
      )
        cancelEmergency()
      else
        void sayMessage(
          "reminder",
          "Please confirm by saying ‘I’m okay’ or pressing the I’m okay button if you are safe."
        )
    } else appendMessage("alexa", getDemoReply(prompt))
    setDraft("")
    setVoiceNotice("")
  }

  function toggleListening() {
    if (voiceState !== "idle") {
      recognitionRef.current?.stop()
      setVoiceState("idle")
      return
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionController
      webkitSpeechRecognition?: new () => SpeechRecognitionController
    }
    const SpeechRecognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setVoiceNotice(
        "Voice input isn’t available in this browser. You can still type to Alexa."
      )
      return
    }

    const controller = new SpeechRecognition()
    controller.lang = navigator.language || "en-US"
    controller.interimResults = false
    controller.onstart = () => setVoiceState("listening")
    controller.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript.trim()
      if (transcript) {
        setVoiceState("processing")
        sendMessage(transcript)
      }
    }
    controller.onerror = (event) => {
      const messages: Record<string, string> = {
        "not-allowed":
          "Microphone access is blocked. Allow it in your browser settings, or type instead.",
        "service-not-allowed":
          "Voice input is blocked by this browser. You can type instead.",
        "no-speech": "I didn’t hear anything. Try again, or type instead.",
        "audio-capture":
          "No microphone was found. Connect one, or type instead.",
        network:
          "Voice input couldn’t connect. Check your connection, or type instead.",
      }
      setVoiceNotice(
        messages[event.error] ??
          "Voice input stopped. Try again, or type instead."
      )
      setVoiceState("idle")
    }
    controller.onend = () => {
      setVoiceState("idle")
      recognitionRef.current = null
    }
    recognitionRef.current = controller
    setVoiceNotice("")
    setVoiceState("starting")

    try {
      controller.start()
    } catch {
      recognitionRef.current = null
      setVoiceState("idle")
      setVoiceNotice(
        "Voice input couldn’t start. Check your microphone settings, or type instead."
      )
    }
  }

  return (
    <main className="grid h-dvh min-h-155 w-full grid-cols-[minmax(0,1fr)_308px] overflow-hidden bg-[#070d17] [font-family:var(--font-sans),sans-serif] text-[#f3f6fa] max-[1120px]:grid-cols-[minmax(0,1fr)_276px] max-[850px]:grid-cols-[minmax(0,1fr)_270px] max-[640px]:flex max-[640px]:h-auto max-[640px]:min-h-svh max-[640px]:flex-col max-[640px]:overflow-visible">
      <section
        className="flex min-h-0 min-w-0 flex-col bg-[#0b1421] max-[640px]:h-svh max-[640px]:min-h-[620px] max-[640px]:flex-none"
        id="home"
      >
        <AlexaHeader
          onOpenDevices={() => setDevicesOpen(true)}
          onSimulateFall={simulateFall}
          simulationBusy={["first_check", "second_check", "sending"].includes(
            emergencyStage
          )}
        />
        <div className="flex min-h-0 flex-1 scrollbar-thin [scrollbar-color:#39434a_transparent] overflow-auto overscroll-contain">
          {messages.length === 0 ? (
            <WelcomePanel
              suggestions={suggestions}
              onSuggestion={sendMessage}
            />
          ) : (
            <ConversationThread messages={messages} />
          )}
        </div>
        <MessageComposer
          draft={draft}
          voiceState={voiceState}
          voiceNotice={voiceNotice}
          onDraftChange={setDraft}
          onSend={() => sendMessage()}
          onToggleListening={toggleListening}
          safetyCheck={
            emergencyStage === "first_check"
              ? 1
              : emergencyStage === "second_check"
                ? 2
                : null
          }
          secondsLeft={secondsLeft}
          onConfirmOkay={() => sendMessage("I'm okay")}
        />
      </section>
      <DevicesPanel open={devicesOpen} onClose={() => setDevicesOpen(false)} />
    </main>
  )
}
