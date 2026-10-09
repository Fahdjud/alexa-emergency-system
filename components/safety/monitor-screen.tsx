"use client"

/*
 * monitor-screen.tsx: the safety monitor. On first use it shows the setup
 * screen; after that, a calm main screen: listening status, what is being
 * watched for, recent activity, the spoken conversation, and a full-screen
 * "Are you okay?" prompt when something is detected.
 *
 * Why this file exists: the existing AlexaAssistant is a push-to-talk chat
 * and cannot listen continuously. This is a new screen, so the demo at "/"
 * stays unchanged. It reuses ConversationThread for the conversation. All
 * logic lives in hooks/use-safety-monitor.ts, so teammates can restyle this.
 */
import { useEffect, useState, type ReactNode } from "react"
import {
  AudioLines,
  Mic,
  MicOff,
  Settings,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"

import { ConversationThread } from "@/components/alexa/conversation"
import { ConfirmationPrompt } from "@/components/safety/confirmation-prompt"
import { SetupWizard } from "@/components/safety/setup-wizard"
import { Button } from "@/components/ui/button"
import type { ClassifierStatus } from "@/hooks/use-sound-triggers"
import { useSafetyMonitor, type Detection } from "@/hooks/use-safety-monitor"
import { BUFFER_SECONDS } from "@/lib/audio/audio-settings"
import type { SpeechListenerStatus } from "@/lib/audio/speech-listener"
import { DEFAULT_PROFILE } from "@/lib/client/monitor-settings"
import { listContacts, type IncidentStatusView } from "@/lib/client/safety-api"
import { getIncident, INCIDENTS } from "@/lib/safety/incidents"
import { EMERGENCY_NUMBERS } from "@/lib/safety/region"
import { LANGUAGES, languagePack } from "@/lib/safety/languages"
import type { Language, TriggerMatch } from "@/lib/safety/types"

const cardClass =
  "grid gap-3 rounded-2xl border border-[#263d54] bg-[#0e1b2a] p-5"

export function MonitorScreen() {
  const monitor = useSafetyMonitor()
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (!monitor.deviceToken || !monitor.profile || settingsOpen) {
    return (
      <SetupWizard
        deviceToken={monitor.deviceToken}
        language={monitor.language}
        profile={monitor.profile ?? DEFAULT_PROFILE}
        canClose={Boolean(monitor.deviceToken && monitor.profile)}
        onClose={() => setSettingsOpen(false)}
        onSave={({ deviceToken, language, profile }) => {
          monitor.setDeviceToken(deviceToken)
          monitor.setLanguage(language)
          monitor.saveProfile(profile)
          setSettingsOpen(false)
        }}
      />
    )
  }

  return (
    <MainScreen
      monitor={monitor}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  )
}

type Monitor = ReturnType<typeof useSafetyMonitor>

function MainScreen({
  monitor,
  onOpenSettings,
}: {
  monitor: Monitor
  onOpenSettings: () => void
}) {
  const { audio, state } = monitor
  const listening = audio.status === "on"
  const [showDetails, setShowDetails] = useState(false)
  const connectedContacts = useConnectedContacts(monitor.deviceToken)

  return (
    <main className="min-h-dvh bg-[#0b1421] px-4 py-6 text-[#f3f6fa]">
      <div className="mx-auto grid max-w-2xl gap-5">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-[#48d4f2]" size={24} />
            <span className="text-lg font-semibold">Home Safety Monitor</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitch
              value={monitor.language}
              onChange={monitor.setLanguage}
            />
            <Button
              className="text-[#a8bacb] hover:bg-[#14283b] hover:text-white"
              variant="ghost"
              size="icon"
              aria-label="Settings"
              onClick={onOpenSettings}
            >
              <Settings size={18} />
            </Button>
          </div>
        </header>

        {state.phase === "confirming" && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-[#020712]/85 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg">
              <ConfirmationPrompt
                incident={state.incident}
                deadlineMs={state.deadlineMs}
                language={monitor.language}
                onAnswer={monitor.answer}
              />
            </div>
          </div>
        )}

        {monitor.activeAlert && (
          <section
            className="grid gap-3 rounded-2xl border-2 border-[#e86b5f] bg-[#2b1311] p-5"
            role="alert"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="text-[#ff9a8f]" size={22} />
              <h2 className="m-0 text-lg font-semibold text-[#ffd9d4]">
                Getting help:{" "}
                {getIncident(monitor.activeAlert.incidentId).label}
              </h2>
            </div>
            <p className="m-0 text-sm text-[#f5b8b0]">
              {monitor.activeAlert.reason === "no-answer"
                ? "There was no answer in time."
                : "Help was requested."}{" "}
              {escalationProgress(monitor.serverStatus)}
            </p>
            <Button
              className="justify-self-start border-[#5a2a25] bg-[#3a1814] text-[#ffd9d4] hover:bg-[#4a1f1a]"
              variant="outline"
              size="sm"
              onClick={monitor.dismissAlert}
            >
              Close
            </Button>
          </section>
        )}

        <section
          className={`${cardClass} justify-items-center py-8 text-center`}
        >
          <StatusOrb
            listening={listening}
            checking={state.phase === "checking"}
            level={audio.level}
          />
          <div className="grid gap-1">
            <h1 className="m-0 text-2xl font-semibold">{heroTitle(monitor)}</h1>
            <p className="m-0 text-sm text-[#a7adb2]">
              {heroSubtitle(monitor)}
            </p>
          </div>
          {audio.status === "error" && (
            <p className="m-0 text-sm text-[#e2b78e]">{audio.error}</p>
          )}
          <Button
            className={`h-12 min-w-48 rounded-xl text-base font-semibold ${listening ? "border border-[#2383a3] bg-[#102c42] text-[#a4efff] hover:bg-[#163951]" : "bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5]"}`}
            disabled={audio.status === "starting"}
            onClick={listening ? monitor.stop : monitor.start}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
            {listening
              ? "Pause monitoring"
              : audio.status === "starting"
                ? "Starting..."
                : "Start monitoring"}
          </Button>
        </section>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatusChip
            label="Sound"
            {...soundStatus(monitor.soundStatus, listening)}
          />
          <StatusChip
            label="Speech"
            {...speechStatus(monitor.speechStatus, monitor.language, listening)}
          />
          <StatusChip
            label="Contacts"
            text={
              connectedContacts === null
                ? "…"
                : `${connectedContacts} connected`
            }
            tone={connectedContacts ? "good" : "warn"}
          />
          <StatusChip
            label="Alerts"
            text={carefulnessText(monitor.profile?.carefulness)}
            tone="neutral"
          />
        </div>

        <section className={cardClass}>
          <h2 className="m-0 text-sm font-semibold text-[#d4e0ec]">
            Watching for
          </h2>
          <div className="flex flex-wrap gap-2">
            {INCIDENTS.filter(
              (incident) => monitor.profile?.incidents[incident.id] !== "off"
            ).map((incident) => (
              <span
                className="rounded-full border border-[#26718a] bg-[#10283a] px-3 py-1 text-xs text-[#a4efff]"
                key={incident.id}
              >
                {incident.label}
                {monitor.profile?.incidents[incident.id] === "high" && (
                  <strong className="ml-1 text-[#ffd27a]">High</strong>
                )}
              </span>
            ))}
          </div>
        </section>

        <section className={cardClass} aria-live="polite">
          <h2 className="m-0 text-sm font-semibold text-[#d4e0ec]">
            Recent activity
          </h2>
          {monitor.detections.length === 0 ? (
            <p className="m-0 text-sm text-[#a7adb2]">
              Nothing yet. Anything the monitor notices will appear here.
            </p>
          ) : (
            <ol className="m-0 grid list-none gap-0 p-0">
              {monitor.detections.map((detection) => (
                <ActivityItem detection={detection} key={detection.id} />
              ))}
            </ol>
          )}
        </section>

        {monitor.dialogue.length > 0 && (
          <section
            className="rounded-2xl border border-[#263d54] bg-[#0e1b2a]"
            aria-label="Conversation"
          >
            <ConversationThread messages={monitor.dialogue} />
          </section>
        )}

        <footer className="grid gap-2 pb-4 text-center">
          <p className="m-0 text-xs text-[#858b92]">
            Keep this screen open on a plugged-in device. Only the last{" "}
            {BUFFER_SECONDS} seconds of sound are kept in memory, and audio is
            sent only when something is detected. In an emergency, call{" "}
            {EMERGENCY_NUMBERS.unified}.
          </p>
          <button
            className="justify-self-center text-xs text-[#6f8093] underline-offset-2 hover:text-[#a8bacb] hover:underline"
            onClick={() => setShowDetails((value) => !value)}
          >
            {showDetails
              ? "Hide what the monitor hears"
              : "Show what the monitor hears"}
          </button>
          {showDetails && (
            <div className="grid gap-1 rounded-lg border border-[#23354a] p-3 text-left text-xs text-[#a8bacb]">
              <span>
                Sounds:{" "}
                {monitor.hearing.length > 0
                  ? monitor.hearing
                      .map(
                        ({ label, score }) =>
                          `${label} ${Math.round(score * 100)}%`
                      )
                      .join(" · ")
                  : "—"}
              </span>
              <span dir="auto">
                Words ({languagePack(monitor.language).nativeName}):{" "}
                {monitor.lastHeard ? `“${monitor.lastHeard}”` : "—"}
              </span>
            </div>
          )}
        </footer>
      </div>
    </main>
  )
}

function StatusOrb({
  listening,
  checking,
  level,
}: {
  listening: boolean
  checking: boolean
  level: number
}) {
  const scale = listening ? 1 + Math.min(level, 1) * 0.25 : 1
  return (
    <div className="relative grid size-36 place-items-center">
      {listening && (
        <span className="absolute inset-0 animate-ping rounded-full bg-[#00c8f4]/10 motion-reduce:animate-none" />
      )}
      <span
        className={`absolute inset-3 rounded-full transition-transform duration-100 motion-reduce:transition-none ${checking ? "bg-[#3a2f14]" : listening ? "bg-[#10283a]" : "bg-[#132131]"}`}
        style={{ transform: `scale(${scale})` }}
      />
      <span
        className={`relative grid size-24 place-items-center rounded-full border ${checking ? "border-[#ffd27a] text-[#ffd27a]" : listening ? "border-[#26718a] text-[#58d9f3]" : "border-[#2a4057] text-[#6f8093]"}`}
      >
        {listening ? (
          <AudioLines size={40} strokeWidth={1.6} />
        ) : (
          <MicOff size={36} strokeWidth={1.6} />
        )}
      </span>
    </div>
  )
}

function StatusChip({
  label,
  text,
  tone,
}: {
  label: string
  text: string
  tone: "good" | "warn" | "bad" | "neutral"
}) {
  const dot = {
    good: "bg-[#6eb687]",
    warn: "bg-[#e2b78e]",
    bad: "bg-[#e86b5f]",
    neutral: "bg-[#48d4f2]",
  }[tone]
  return (
    <div className="grid gap-0.5 rounded-xl border border-[#23354a] bg-[#0e1b2a] px-3 py-2">
      <span className="text-[11px] text-[#858b92]">{label}</span>
      <span className="flex items-center gap-1.5 text-xs text-[#d4e0ec]">
        <span className={`size-2 shrink-0 rounded-full ${dot}`} />
        {text}
      </span>
    </div>
  )
}

function ActivityItem({ detection }: { detection: Detection }) {
  const ignored = detection.note?.startsWith("Ignored")
  return (
    <li className="grid gap-0.5 border-t border-[#23354a] py-2.5 first:border-t-0 first:pt-0">
      <span className="flex items-baseline justify-between gap-3">
        <span
          className={`text-sm ${ignored ? "text-[#8fa2b6]" : "text-[#e8eef5]"}`}
        >
          {getIncident(detection.match.incidentId).label}
        </span>
        <span className="shrink-0 text-xs text-[#6f8093]">
          {new Date(detection.atMs).toLocaleTimeString()}
        </span>
      </span>
      <span className="text-xs text-[#9baabc]" dir="auto">
        {describeTrigger(detection.match)}
        {detection.note && ` · ${detection.note}`}
      </span>
    </li>
  )
}

function LanguageSwitch({
  value,
  onChange,
}: {
  value: Language
  onChange: (language: Language) => void
}) {
  return (
    <div
      className="flex rounded-lg border border-[#233850] bg-[#091523] p-1"
      role="group"
      aria-label="Language spoken at home"
    >
      {LANGUAGES.map((language) => (
        <button
          className={`rounded-md px-2.5 py-1 text-xs ${value === language ? "bg-[#16334a] text-[#72def2]" : "text-[#8fa2b6] hover:text-[#d6e2ee]"}`}
          aria-pressed={value === language}
          key={language}
          onClick={() => onChange(language)}
        >
          {languagePack(language).nativeName}
        </button>
      ))}
    </div>
  )
}

/** How many contacts can be alerted right now; refreshed every minute. */
function useConnectedContacts(deviceToken: string): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    const load = () =>
      void listContacts(deviceToken).then((list) => {
        if (!cancelled && list)
          setCount(list.filter((contact) => contact.connected).length)
      })
    load()
    const timer = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [deviceToken])
  return count
}

function heroTitle(monitor: Monitor): string {
  if (monitor.state.phase === "checking") return "Checking what was said…"
  if (monitor.audio.status === "on") return "Listening"
  if (monitor.audio.status === "starting") return "Starting…"
  return "Paused"
}

function heroSubtitle(monitor: Monitor): string {
  const { state } = monitor
  if (state.phase === "checking")
    return `Heard something that may be: ${getIncident(state.incident.incidentId).label}`
  if (monitor.audio.status === "on")
    return "All quiet. You will be asked if anything sounds wrong."
  return "Start monitoring to keep this home safe."
}

function soundStatus(
  status: ClassifierStatus,
  listening: boolean
): { text: string; tone: "good" | "warn" | "bad" | "neutral" } {
  if (!listening) return { text: "Paused", tone: "neutral" }
  if (status === "ready") return { text: "Recognising", tone: "good" }
  if (status === "error") return { text: "Could not load", tone: "bad" }
  return { text: "Loading…", tone: "warn" }
}

function speechStatus(
  status: SpeechListenerStatus,
  language: Language,
  listening: boolean
): { text: string; tone: "good" | "warn" | "bad" | "neutral" } {
  if (!listening) return { text: "Paused", tone: "neutral" }
  if (status === "on") return { text: languagePack(language).nativeName, tone: "good" }
  if (status === "unsupported") return { text: "Use Chrome", tone: "bad" }
  if (status === "blocked") return { text: "Blocked", tone: "bad" }
  return { text: "Starting…", tone: "warn" }
}

function carefulnessText(carefulness: string | undefined): string {
  if (carefulness === "always-ask") return "Always ask"
  if (carefulness === "only-when-sure") return "Fewer interruptions"
  return "Balanced"
}

function escalationProgress(status: IncidentStatusView | null): ReactNode {
  if (!status) return "Alerting your contacts…"
  if (status.status === "acknowledged")
    return `${status.acknowledgedBy ?? "A contact"} is handling it.`
  if (status.status === "unacknowledged")
    return `Nobody has answered yet. Call ${EMERGENCY_NUMBERS.unified} if you can.`
  return "Alerting your contacts one by one until someone responds. The monitor keeps listening."
}

function describeTrigger(match: TriggerMatch): string {
  return match.source === "sound"
    ? `${match.label} (${Math.round(match.score * 100)}%)`
    : `“${match.phrase}”`
}
