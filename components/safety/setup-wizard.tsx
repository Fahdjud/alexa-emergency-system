"use client"

/*
 * setup-wizard.tsx: the first-run setup, also reachable from Settings.
 * Five short steps: connect this device, choose what to watch for (Off /
 * Normal / High per incident), choose how careful the AI should be, add
 * emergency contacts, and finish.
 *
 * Why this file exists: every home is different. An older person living
 * alone needs falls on High; a home with a baby may switch crying off. The
 * answers are saved in this browser (lib/client/monitor-settings.ts) and turned
 * into detection settings by lib/safety/profile.ts.
 */
import { useState, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react"

import { ContactsPanel } from "@/components/safety/contacts-panel"
import { Button } from "@/components/ui/button"
import { verifyDeviceToken, type ContactView } from "@/lib/client/safety-api"
import { INCIDENTS } from "@/lib/safety/incidents"
import type {
  Carefulness,
  MonitorProfile,
  Sensitivity,
} from "@/lib/safety/profile"
import { LANGUAGES, languagePack } from "@/lib/safety/languages"
import type { Language } from "@/lib/safety/types"

type Props = {
  deviceToken: string
  language: Language
  profile: MonitorProfile
  /** Setup was opened from Settings (not the first run): it can be closed without changes. */
  canClose: boolean
  onSave: (result: {
    deviceToken: string
    language: Language
    profile: MonitorProfile
  }) => void
  onClose: () => void
}

const STEPS = ["Connect", "Watch for", "Alerts", "Contacts", "Done"] as const

const SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  off: "Off",
  normal: "Normal",
  high: "High",
}

const CAREFULNESS_OPTIONS: {
  value: Carefulness
  title: string
  body: string
}[] = [
  {
    value: "always-ask",
    title: "Always ask",
    body: "Ask “Are you okay?” every time something is detected. Fastest, never second-guesses. Best for someone who lives alone.",
  },
  {
    value: "balanced",
    title: "Balanced (recommended)",
    body: "AI listens to what was said and skips the question only when it is very sure nothing is wrong, like a TV show.",
  },
  {
    value: "only-when-sure",
    title: "Fewer interruptions",
    body: "Needs stronger sounds and lets the AI skip more false alarms. For busy, noisy homes.",
  },
]

export function SetupWizard({
  deviceToken,
  language,
  profile,
  canClose,
  onSave,
  onClose,
}: Props) {
  const [step, setStep] = useState(0)
  const [token, setToken] = useState(deviceToken)
  const [lang, setLang] = useState<Language>(language)
  const [answers, setAnswers] = useState<MonitorProfile>(profile)
  const [tokenState, setTokenState] = useState<
    "idle" | "checking" | "wrong" | "unreachable"
  >("idle")
  const [contacts, setContacts] = useState<ContactView[]>([])

  async function connect() {
    setTokenState("checking")
    const result = await verifyDeviceToken(token.trim())
    if (result !== "ok") return setTokenState(result)
    setTokenState("idle")
    setStep(1)
  }

  const setSensitivity = (
    id: keyof MonitorProfile["incidents"],
    value: Sensitivity
  ) =>
    setAnswers((current) => ({
      ...current,
      incidents: { ...current.incidents, [id]: value },
    }))

  const finish = () =>
    onSave({ deviceToken: token.trim(), language: lang, profile: answers })
  const watched = INCIDENTS.filter(
    (incident) => answers.incidents[incident.id] !== "off"
  )
  const connected = contacts.filter((contact) => contact.connected).length

  return (
    <main className="min-h-dvh bg-[#0b1421] px-4 py-8 text-[#f3f6fa]">
      <div className="mx-auto grid max-w-xl gap-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-[#48d4f2]" size={24} />
            <span className="text-lg font-semibold">Home Safety Monitor</span>
          </div>
          {canClose && (
            <Button
              className="text-[#a8bacb] hover:bg-[#14283b] hover:text-white"
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
          )}
        </header>

        <ol
          className="m-0 flex list-none gap-1.5 p-0"
          aria-label="Setup progress"
        >
          {STEPS.map((name, index) => (
            <li
              className="grid flex-1 gap-1"
              key={name}
              aria-current={index === step ? "step" : undefined}
            >
              <span
                className={`h-1 rounded-full ${index <= step ? "bg-[#00c8f4]" : "bg-[#23354a]"}`}
              />
              <span
                className={`text-[11px] ${index === step ? "text-[#d4e0ec]" : "text-[#6f8093]"}`}
              >
                {name}
              </span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <Step
            title="Connect this device"
            intro="This tablet or laptop becomes the home's safety monitor. Enter the household code you were given (the MONITOR_DEVICE_TOKEN)."
          >
            <input
              className="h-11 rounded-lg border border-[#263d54] bg-[#091523] px-3 text-sm outline-none focus:border-[#168aa4]"
              type="password"
              autoComplete="off"
              aria-label="Household code"
              placeholder="Household code"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            {tokenState === "wrong" && (
              <Notice>That code is not right. Check it and try again.</Notice>
            )}
            {tokenState === "unreachable" && (
              <Notice>
                Could not reach the server. Check the internet connection.
              </Notice>
            )}

            <span className="text-sm text-[#d4e0ec]">
              Language people speak at home
            </span>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((value) => (
                <Choice
                  key={value}
                  selected={lang === value}
                  onClick={() => setLang(value)}
                >
                  {languagePack(value).nativeName}
                </Choice>
              ))}
            </div>
            <Nav
              next={{
                label: tokenState === "checking" ? "Checking..." : "Connect",
                disabled: !token.trim() || tokenState === "checking",
                onClick: connect,
              }}
            />
          </Step>
        )}

        {step === 1 && (
          <Step
            title="What should we watch for?"
            intro="Choose High for what matters most in this home: the monitor reacts to fainter sounds and always asks. Choose Off for things you do not need."
          >
            <ul className="m-0 grid list-none gap-2 p-0">
              {INCIDENTS.map((incident) => (
                <li
                  className="grid gap-2 rounded-lg border border-[#23354a] bg-[#0b1624] p-3"
                  key={incident.id}
                >
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium text-[#e8eef5]">
                      {incident.label}
                    </span>
                    <span className="text-xs text-[#9baabc]">
                      {incident.description}
                    </span>
                  </span>
                  <div
                    className="grid grid-cols-3 gap-1 rounded-lg bg-[#091523] p-1"
                    role="radiogroup"
                    aria-label={incident.label}
                  >
                    {(["off", "normal", "high"] as const).map((value) => (
                      <button
                        className={`rounded-md py-1.5 text-xs ${answers.incidents[incident.id] === value ? "bg-[#16334a] font-semibold text-[#72def2]" : "text-[#8fa2b6] hover:text-[#d6e2ee]"}`}
                        role="radio"
                        aria-checked={answers.incidents[incident.id] === value}
                        key={value}
                        onClick={() => setSensitivity(incident.id, value)}
                      >
                        {SENSITIVITY_LABELS[value]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            {answers.incidents.fall === "high" && (
              <p className="m-0 text-xs text-[#a8bacb]">
                Falls on High: any sudden loud impact also counts as a possible
                fall, so you may be asked a little more often.
              </p>
            )}
            <Nav
              back={() => setStep(0)}
              next={{
                label: "Next",
                disabled: watched.length === 0,
                onClick: () => setStep(2),
              }}
            />
          </Step>
        )}

        {step === 2 && (
          <Step
            title="When should we ask?"
            intro="Something was detected. Should the monitor ask “Are you okay?” straight away, or let the AI check what was said first?"
          >
            <div
              className="grid gap-2"
              role="radiogroup"
              aria-label="When to ask"
            >
              {CAREFULNESS_OPTIONS.map((option) => (
                <Choice
                  key={option.value}
                  selected={answers.carefulness === option.value}
                  onClick={() =>
                    setAnswers((current) => ({
                      ...current,
                      carefulness: option.value,
                    }))
                  }
                >
                  <span className="grid gap-0.5 text-left">
                    <span className="text-sm font-semibold">
                      {option.title}
                    </span>
                    <span className="text-xs font-normal text-[#9baabc]">
                      {option.body}
                    </span>
                  </span>
                </Choice>
              ))}
            </div>
            <Nav
              back={() => setStep(1)}
              next={{ label: "Next", onClick: () => setStep(3) }}
            />
          </Step>
        )}

        {step === 3 && (
          <Step
            title="Who should we alert?"
            intro="If nobody answers, or someone asks for help, these people get a Telegram message one after another until one of them responds. Each person opens their invite once and taps Start."
          >
            <ContactsPanel deviceToken={token.trim()} onChange={setContacts} />
            <Nav
              back={() => setStep(2)}
              next={{ label: "Next", onClick: () => setStep(4) }}
            />
          </Step>
        )}

        {step === 4 && (
          <Step
            title="All set"
            intro="Here is how this home is protected. You can change any of it later in Settings."
          >
            <dl className="m-0 grid gap-3 rounded-lg border border-[#23354a] bg-[#0b1624] p-4 text-sm">
              <Summary term="Watching for">
                {watched
                  .map(
                    (incident) =>
                      `${incident.label}${answers.incidents[incident.id] === "high" ? " (High)" : ""}`
                  )
                  .join(", ")}
              </Summary>
              <Summary term="When something happens">
                {
                  CAREFULNESS_OPTIONS.find(
                    (option) => option.value === answers.carefulness
                  )?.title
                }
              </Summary>
              <Summary term="Contacts">
                {contacts.length === 0
                  ? "None yet: nobody can be alerted"
                  : `${contacts.length} added, ${connected} connected`}
              </Summary>
              <Summary term="Language">{languagePack(lang).nativeName}</Summary>
            </dl>
            {contacts.length > 0 && connected === 0 && (
              <Notice>
                No contact has connected yet. Alerts start working as soon as
                one of them taps Start in Telegram or confirms their email.
              </Notice>
            )}
            <Nav
              back={() => setStep(3)}
              next={{ label: "Start monitoring", onClick: finish }}
            />
          </Step>
        )}
      </div>
    </main>
  )
}

function Step({
  title,
  intro,
  children,
}: {
  title: string
  intro: string
  children: ReactNode
}) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-1.5">
        <h1 className="m-0 text-2xl font-semibold">{title}</h1>
        <p className="m-0 text-sm leading-relaxed text-[#a7adb2]">{intro}</p>
      </div>
      {children}
    </section>
  )
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      className={`rounded-lg border p-3 text-sm transition-colors ${selected ? "border-[#00c8f4] bg-[#10283a] text-white" : "border-[#263d54] bg-[#0e1b2a] text-[#d4e0ec] hover:border-[#287b95]"}`}
      role="radio"
      aria-checked={selected}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Nav({
  back,
  next,
}: {
  back?: () => void
  next: { label: string; disabled?: boolean; onClick: () => void }
}) {
  return (
    <div className="flex justify-between gap-3 pt-2">
      {back ? (
        <Button
          className="border-[#263c53] bg-[#101e2d] text-[#d4e0ec] hover:bg-[#14283b]"
          variant="outline"
          onClick={back}
        >
          <ArrowLeft size={15} />
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button
        className="bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5]"
        disabled={next.disabled}
        onClick={next.onClick}
      >
        {next.label}
        <ArrowRight size={15} />
      </Button>
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="m-0 text-sm text-[#e2b78e]">{children}</p>
}

function Summary({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-[#858b92]">{term}</dt>
      <dd className="m-0 text-[#e8eef5]">{children}</dd>
    </div>
  )
}
