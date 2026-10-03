"use client"

/*
 * monitor-screen.tsx: the always-on safety monitor screen. It shows the
 * microphone status, what the device hears, the "Are you okay?" prompt, the
 * spoken dialogue and detected incidents, plus test tools.
 *
 * Why this file exists: the existing AlexaAssistant is a push-to-talk chat
 * and cannot listen continuously. This is a new screen, so the demo at "/"
 * stays unchanged. It reuses ConversationThread for the dialogue. All logic
 * lives in hooks/use-safety-monitor.ts, so teammates can restyle this freely.
 */
import { useState } from "react"

import { ConversationThread } from "@/components/alexa/conversation"
import { ConfirmationPrompt } from "@/components/safety/confirmation-prompt"
import { ContactsPanel } from "@/components/safety/contacts-panel"
import { SimulatePanel } from "@/components/safety/simulate-panel"
import { Button } from "@/components/ui/button"
import type { AudioClip } from "@/hooks/use-audio-capture"
import type { ClassifierStatus } from "@/hooks/use-sound-triggers"
import { useSafetyMonitor } from "@/hooks/use-safety-monitor"
import { AFTER_TRIGGER_SECONDS, BUFFER_SECONDS } from "@/lib/audio/audio-settings"
import type { SpeechListenerStatus } from "@/lib/audio/speech-listener"
import type { IncidentStatusView } from "@/lib/client/safety-api"
import { encodeWav } from "@/lib/audio/wav"
import { getIncident } from "@/lib/safety/incidents"
import { EMERGENCY_NUMBERS } from "@/lib/safety/region"
import type { Language, TriggerMatch } from "@/lib/safety/types"

const outlineButtonClass =
  "border-[#263c53] bg-[#101e2d] text-[#d4e0ec] hover:border-[#287b95] hover:bg-[#14283b] hover:text-white focus-visible:ring-[#00c8f4]"
const cardClass = "grid gap-3 rounded-[10px] border border-[#263d54] bg-[#0e1b2a] p-4"

const microphoneText = {
  off: "Not listening.",
  starting: "Waiting for microphone access...",
  on: "Listening.",
  error: "",
}

const classifierText: Record<ClassifierStatus, string> = {
  off: "",
  loading: "Loading the sound model (about 4 MB)...",
  ready: "",
  error: "The sound model could not load. Check the internet connection, then stop and start listening.",
}

const speechText: Record<SpeechListenerStatus, string> = {
  off: "",
  on: "",
  unsupported: "Speech recognition isn't available in this browser, so spoken phrases and answers won't be heard. Use Chrome.",
  blocked: "Speech recognition is blocked. Allow the microphone for this site, then stop and start listening.",
}

const languageNames: Record<Language, string> = { en: "English", ar: "العربية" }

export function MonitorScreen() {
  const monitor = useSafetyMonitor()
  const { audio, state } = monitor
  const listening = audio.status === "on"
  const notices = [classifierText[monitor.soundStatus], speechText[monitor.speechStatus]].filter(Boolean)

  return (
    <main className="min-h-dvh bg-[#0b1421] px-4 py-10 text-[#f3f6fa]">
      <div className="mx-auto grid max-w-xl gap-6">
        <header className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="m-0 text-2xl font-normal">Safety monitor</h1>
            <LanguageSwitch value={monitor.language} onChange={monitor.setLanguage} />
          </div>
          <p className="m-0 text-sm text-[#a7adb2]">
            Keep this tab open and the device plugged in. Audio stays in this tab&apos;s memory: only the last {BUFFER_SECONDS}{" "}
            seconds, constantly overwritten. Spoken words are recognised by Chrome&apos;s speech service.
          </p>
        </header>

        {!monitor.deviceToken && <DeviceTokenSetup onSave={monitor.setDeviceToken} />}

        {state.phase === "checking" && (
          <p className="m-0 rounded-[10px] border border-[#26718a] bg-[#10283a] p-4 text-sm text-[#a4efff]" role="status">
            Heard something ({getIncident(state.incident.incidentId).label}). Checking what was said...
          </p>
        )}

        {state.phase === "confirming" && (
          <ConfirmationPrompt incident={state.incident} deadlineMs={state.deadlineMs} language={monitor.language} onAnswer={monitor.answer} />
        )}

        {state.phase === "escalated" && (
          <section className="grid gap-3 rounded-[12px] border-2 border-[#e86b5f] bg-[#2b1311] p-5 text-center" role="alert">
            <h2 className="m-0 text-xl font-semibold text-[#ffd9d4]">Getting help</h2>
            <p className="m-0 text-sm text-[#f5b8b0]">
              {getIncident(state.incident.incidentId).label}: {state.reason === "no-answer" ? "no answer in time." : "help was requested."}{" "}
              {escalationProgress(monitor.serverStatus, Boolean(monitor.deviceToken))}
            </p>
            <Button className={outlineButtonClass} variant="outline" onClick={monitor.resume}>
              Back to listening
            </Button>
          </section>
        )}

        <section className={cardClass}>
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-sm text-[#d4e0ec]" role="status" aria-live="polite">
              {audio.status === "error" ? audio.error : microphoneText[audio.status]}
            </p>
            <Button
              className={listening ? "border border-[#2383a3] bg-[#102c42] text-[#a4efff] hover:bg-[#163951]" : "bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5]"}
              disabled={audio.status === "starting"}
              onClick={listening ? monitor.stop : monitor.start}
            >
              {listening ? "Stop listening" : "Start listening"}
            </Button>
          </div>
          <LevelMeter level={audio.level} />
          {notices.map((notice) => (
            <p className="m-0 text-xs text-[#e2b78e]" key={notice}>
              {notice}
            </p>
          ))}
          {monitor.hearing.length > 0 && (
            <p className="m-0 text-xs text-[#a8bacb]">
              Hearing: {monitor.hearing.map(({ label, score }) => `${label} ${Math.round(score * 100)}%`).join(" · ")}
            </p>
          )}
          {listening && monitor.lastHeard && (
            <p className="m-0 text-xs text-[#a8bacb]" dir="auto">
              Last words: “{monitor.lastHeard}”
            </p>
          )}
        </section>

        {monitor.dialogue.length > 0 && (
          <section className="rounded-[10px] border border-[#263d54] bg-[#0e1b2a]" aria-label="Dialogue">
            <ConversationThread messages={monitor.dialogue} />
          </section>
        )}

        <section className={cardClass} aria-live="polite">
          <h2 className="m-0 text-sm font-semibold text-[#d4e0ec]">Detections</h2>
          {monitor.detections.length === 0 ? (
            <p className="m-0 text-xs text-[#a7adb2]">Nothing detected yet.</p>
          ) : (
            <ul className="m-0 grid list-none gap-1 p-0 text-sm">
              {monitor.detections.map(({ id, atMs, match, note }) => (
                <li className="flex justify-between gap-3 border-t border-[#23354a] pt-1 first:border-t-0 first:pt-0" key={id}>
                  <span>{getIncident(match.incidentId).label}</span>
                  <span className="grid text-end text-xs text-[#a8bacb]" dir="auto">
                    <span>
                      {describeTrigger(match)} · {new Date(atMs).toLocaleTimeString()}
                    </span>
                    {note && <span className="text-[#7f93a8]">{note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <details className={cardClass}>
          <summary className="cursor-pointer text-sm font-semibold text-[#d4e0ec]">Test tools</summary>
          {monitor.deviceToken && (
            <Button className={`${outlineButtonClass} justify-self-start`} variant="outline" size="sm" onClick={() => monitor.setDeviceToken("")}>
              Forget this device&apos;s token
            </Button>
          )}
          <p className="m-0 text-xs text-[#a7adb2]">Simulate a trigger (same flow as a real one):</p>
          <SimulatePanel disabled={!listening || state.phase !== "listening"} onSimulate={monitor.simulate} />
          {monitor.deviceToken && (
            <>
              <h3 className="m-0 mt-2 text-sm font-semibold text-[#d4e0ec]">Emergency contacts</h3>
              <ContactsPanel deviceToken={monitor.deviceToken} />
            </>
          )}
          <BufferTools listening={listening} recentAudio={audio.recentAudio} captureSnippet={audio.captureSnippet} />
        </details>
      </div>
    </main>
  )
}

function DeviceTokenSetup({ onSave }: { onSave: (token: string) => void }) {
  const [token, setToken] = useState("")
  return (
    <form
      className={cardClass}
      onSubmit={(event) => {
        event.preventDefault()
        if (token.trim()) onSave(token.trim())
      }}
    >
      <h2 className="m-0 text-sm font-semibold text-[#d4e0ec]">Set up this device</h2>
      <p className="m-0 text-xs text-[#a7adb2]">
        Enter the household&apos;s MONITOR_DEVICE_TOKEN once. It lets this tab check what was said and send alerts. It is kept in this
        browser only. Without it, every trigger goes straight to the &quot;Are you okay?&quot; question.
      </p>
      <div className="flex gap-2">
        <input
          className="h-9 flex-1 rounded-md border border-[#263d54] bg-[#091523] px-3 text-sm outline-none focus:border-[#168aa4]"
          type="password"
          autoComplete="off"
          aria-label="Device token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <Button className="bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5]" type="submit" disabled={!token.trim()}>
          Save
        </Button>
      </div>
    </form>
  )
}

function LanguageSwitch({ value, onChange }: { value: Language; onChange: (language: Language) => void }) {
  return (
    <div className="flex rounded-lg border border-[#233850] bg-[#091523] p-1" role="group" aria-label="Language">
      {(Object.keys(languageNames) as Language[]).map((language) => (
        <button
          className={`rounded-md px-3 py-1 text-xs ${value === language ? "bg-[#16334a] text-[#72def2]" : "text-[#8fa2b6] hover:text-[#d6e2ee]"}`}
          aria-pressed={value === language}
          key={language}
          onClick={() => onChange(language)}
        >
          {languageNames[language]}
        </button>
      ))}
    </div>
  )
}

type BufferToolsProps = {
  listening: boolean
  recentAudio: () => AudioClip | null
  captureSnippet: () => Promise<AudioClip | null>
}

function BufferTools({ listening, recentAudio, captureSnippet }: BufferToolsProps) {
  const [recording, setRecording] = useState(false)

  async function recordTestSnippet() {
    setRecording(true)
    const clip = await captureSnippet()
    setRecording(false)
    if (clip) downloadWav(clip, "test-snippet.wav")
  }

  function downloadRecent() {
    const clip = recentAudio()
    if (clip) downloadWav(clip, "last-seconds.wav")
  }

  return (
    <>
      <p className="m-0 text-xs text-[#a7adb2]">
        Download audio to this computer only. A real trigger uses the same kind of snippet: {BUFFER_SECONDS} seconds before plus{" "}
        {AFTER_TRIGGER_SECONDS} seconds after.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button className={outlineButtonClass} variant="outline" disabled={!listening} onClick={downloadRecent}>
          Download last {BUFFER_SECONDS} s
        </Button>
        <Button className={outlineButtonClass} variant="outline" disabled={!listening || recording} onClick={recordTestSnippet}>
          {recording ? `Recording ${AFTER_TRIGGER_SECONDS} more seconds...` : "Record a test snippet"}
        </Button>
      </div>
    </>
  )
}

function LevelMeter({ level }: { level: number }) {
  const percent = Math.round(level * 100)
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-[#183550]"
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className="h-full bg-[#48d4f2] transition-[width] duration-100 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
    </div>
  )
}

function escalationProgress(status: IncidentStatusView | null, hasToken: boolean): string {
  if (!hasToken) return `This device is not set up, so no one can be alerted. Call ${EMERGENCY_NUMBERS.unified} if you need help.`
  if (!status) return "Alerting your contacts..."
  if (status.status === "acknowledged") return `${status.acknowledgedBy ?? "A contact"} is handling it.`
  if (status.status === "unacknowledged") return `Nobody has answered yet. Call ${EMERGENCY_NUMBERS.unified} if you can.`
  return "Alerting your contacts, one by one, until someone answers."
}

function describeTrigger(match: TriggerMatch): string {
  return match.source === "sound" ? `${match.label} ${Math.round(match.score * 100)}%` : `“${match.phrase}”`
}

function downloadWav(clip: AudioClip, fileName: string) {
  const url = URL.createObjectURL(new Blob([encodeWav(clip.samples, clip.sampleRate)], { type: "audio/wav" }))
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
