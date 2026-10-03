"use client"

/*
 * confirmation-prompt.tsx: the on-screen "Are you okay?" card with large
 * "I'm fine" / "Get help" buttons and a countdown.
 *
 * Why this file exists: the question is spoken, but speech recognition can
 * fail (noise, accent, a soft voice). Big touch buttons are the fallback, and
 * the countdown shows when help will be called automatically. The existing
 * components have nothing like it.
 */
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { getIncident } from "@/lib/safety/incidents"
import type { OpenIncident } from "@/lib/safety/monitor-machine"
import type { Language, ReplyIntent } from "@/lib/safety/types"

const labels: Record<Language, { fine: string; help: string; secondsLeft: (seconds: number) => string }> = {
  en: { fine: "I'm fine", help: "Get help", secondsLeft: (s) => `Calling for help in ${s} s unless you answer.` },
  ar: { fine: "أنا بخير", help: "اطلب المساعدة", secondsLeft: (s) => `سأطلب المساعدة خلال ${s} ثانية إذا لم تُجب.` },
}

type Props = {
  incident: OpenIncident
  deadlineMs: number
  language: Language
  onAnswer: (intent: ReplyIntent) => void
}

export function ConfirmationPrompt({ incident, deadlineMs, language, onAnswer }: Props) {
  const secondsLeft = useSecondsUntil(deadlineMs)
  const text = labels[language]

  return (
    <section
      className="grid gap-4 rounded-[12px] border-2 border-[#e2b78e] bg-[#2a1c14] p-5 text-center"
      role="alertdialog"
      aria-labelledby="confirmation-question"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <h2 className="m-0 text-xl font-semibold text-[#fbe3cc]" id="confirmation-question">
        {getIncident(incident.incidentId).confirmationQuestion[language]}
      </h2>
      <p className="m-0 text-sm text-[#f1c9a5]" aria-live="polite">
        {text.secondsLeft(secondsLeft)}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Button className="h-14 bg-[#6eb687] text-base font-semibold text-[#06131c] hover:bg-[#8fd0a6]" onClick={() => onAnswer("fine")}>
          {text.fine}
        </Button>
        <Button className="h-14 bg-[#e86b5f] text-base font-semibold text-[#1a0806] hover:bg-[#f28a80]" onClick={() => onAnswer("help")}>
          {text.help}
        </Button>
      </div>
    </section>
  )
}

function useSecondsUntil(deadlineMs: number): number {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))
}
