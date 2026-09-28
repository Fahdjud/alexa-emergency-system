"use client"

import { useEffect, useRef, useState } from "react"
import { AlexaHeader } from "./alexa-header"
import { ConversationThread, WelcomePanel } from "./conversation"
import { getDemoReply, suggestions } from "./data"
import { DevicesPanel } from "./devices-panel"
import { MessageComposer } from "./message-composer"
import type { ChatMessage } from "./types"

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

export function AlexaAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [voiceState, setVoiceState] = useState<VoiceState>("idle")
  const [voiceNotice, setVoiceNotice] = useState("")
  const [devicesOpen, setDevicesOpen] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionController | null>(null)

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

    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", text: prompt },
      { id: Date.now() + 1, role: "alexa", text: getDemoReply(prompt) },
    ])
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
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setVoiceNotice("Voice input isn’t available in this browser. You can still type to Alexa.")
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
        "not-allowed": "Microphone access is blocked. Allow it in your browser settings, or type instead.",
        "service-not-allowed": "Voice input is blocked by this browser. You can type instead.",
        "no-speech": "I didn’t hear anything. Try again, or type instead.",
        "audio-capture": "No microphone was found. Connect one, or type instead.",
        network: "Voice input couldn’t connect. Check your connection, or type instead.",
      }
      setVoiceNotice(messages[event.error] ?? "Voice input stopped. Try again, or type instead.")
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
      setVoiceNotice("Voice input couldn’t start. Check your microphone settings, or type instead.")
    }
  }

  return (
    <main className="grid h-dvh min-h-155 w-full grid-cols-[minmax(0,1fr)_308px] overflow-hidden bg-[#070d17] text-[#f3f6fa] [font-family:var(--font-sans),sans-serif] max-[1120px]:grid-cols-[minmax(0,1fr)_276px] max-[850px]:grid-cols-[minmax(0,1fr)_270px] max-[640px]:flex max-[640px]:h-auto max-[640px]:min-h-svh max-[640px]:flex-col max-[640px]:overflow-visible">
      <section className="flex min-h-0 min-w-0 flex-col bg-[#0b1421] max-[640px]:h-svh max-[640px]:min-h-[620px] max-[640px]:flex-none" id="home">
        <AlexaHeader onOpenDevices={() => setDevicesOpen(true)} />
        <div className="flex min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-color:#39434a_transparent] scrollbar-thin">
          {messages.length === 0 ? (
            <WelcomePanel suggestions={suggestions} onSuggestion={sendMessage} />
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
        />
      </section>
      <DevicesPanel open={devicesOpen} onClose={() => setDevicesOpen(false)} />
    </main>
  )
}