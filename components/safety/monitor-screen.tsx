"use client"

/*
 * monitor-screen.tsx: the always-on safety monitor screen. This step shows
 * microphone status, a level meter and test buttons for the rolling buffer.
 * Later steps add sound and phrase triggers, the "Are you okay?" prompt and
 * the incident log.
 *
 * Why this file exists: the existing AlexaAssistant is a push-to-talk chat
 * and cannot listen continuously. This is a new screen, so the demo at "/"
 * stays unchanged. Teammates can restyle it freely; the logic lives in
 * hooks/use-audio-capture.ts.
 */
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useAudioCapture, type AudioClip } from "@/hooks/use-audio-capture"
import { AFTER_TRIGGER_SECONDS, BUFFER_SECONDS } from "@/lib/audio/audio-settings"
import { encodeWav } from "@/lib/audio/wav"

const outlineButtonClass =
  "border-[#263c53] bg-[#101e2d] text-[#d4e0ec] hover:border-[#287b95] hover:bg-[#14283b] hover:text-white focus-visible:ring-[#00c8f4]"

const statusText = {
  off: "Not listening.",
  starting: "Waiting for microphone access...",
  on: "Listening.",
  error: "",
}

export function MonitorScreen() {
  const audio = useAudioCapture()
  const [recordingSnippet, setRecordingSnippet] = useState(false)
  const listening = audio.status === "on"

  async function recordTestSnippet() {
    setRecordingSnippet(true)
    const clip = await audio.captureSnippet()
    setRecordingSnippet(false)
    if (clip) downloadWav(clip, "test-snippet.wav")
  }

  function downloadRecent() {
    const clip = audio.recentAudio()
    if (clip) downloadWav(clip, "last-seconds.wav")
  }

  return (
    <main className="min-h-dvh bg-[#0b1421] px-4 py-10 text-[#f3f6fa]">
      <div className="mx-auto grid max-w-xl gap-6">
        <header>
          <h1 className="m-0 text-2xl font-normal">Safety monitor</h1>
          <p className="mt-2 mb-0 text-sm text-[#a7adb2]">
            Keep this tab open and the device plugged in. Audio stays in this tab&apos;s memory: only the last {BUFFER_SECONDS}{" "}
            seconds, constantly overwritten. Nothing is saved or sent.
          </p>
        </header>

        <section className="grid gap-3 rounded-[10px] border border-[#263d54] bg-[#0e1b2a] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-sm text-[#d4e0ec]" role="status" aria-live="polite">
              {audio.status === "error" ? audio.error : statusText[audio.status]}
            </p>
            <Button
              className={listening ? "border border-[#2383a3] bg-[#102c42] text-[#a4efff] hover:bg-[#163951]" : "bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5]"}
              disabled={audio.status === "starting"}
              onClick={listening ? audio.stop : audio.start}
            >
              {listening ? "Stop listening" : "Start listening"}
            </Button>
          </div>
          <LevelMeter level={audio.level} />
        </section>

        <section className="grid gap-3 rounded-[10px] border border-[#263d54] bg-[#0e1b2a] p-4">
          <h2 className="m-0 text-sm font-semibold text-[#d4e0ec]">Test the buffer</h2>
          <p className="m-0 text-xs text-[#a7adb2]">
            Downloads go only to this computer. A real trigger sends the same kind of snippet: {BUFFER_SECONDS} seconds before plus{" "}
            {AFTER_TRIGGER_SECONDS} seconds after.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button className={outlineButtonClass} variant="outline" disabled={!listening} onClick={downloadRecent}>
              Download last {BUFFER_SECONDS} s
            </Button>
            <Button className={outlineButtonClass} variant="outline" disabled={!listening || recordingSnippet} onClick={recordTestSnippet}>
              {recordingSnippet ? `Recording ${AFTER_TRIGGER_SECONDS} more seconds...` : "Record a test snippet"}
            </Button>
          </div>
        </section>
      </div>
    </main>
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

function downloadWav(clip: AudioClip, fileName: string) {
  const url = URL.createObjectURL(new Blob([encodeWav(clip.samples, clip.sampleRate)], { type: "audio/wav" }))
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
