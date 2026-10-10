"use client"

/*
 * system-test.tsx: the "Test the system" card. A button starts the test;
 * each check then shows its result with a tip when something fails.
 *
 * Why this file exists: a household should know the monitor works before
 * relying on it, and contacts should try the reply buttons once while
 * everyone is calm. It is also the safe way to show the whole flow in a
 * demo. The checks themselves live in hooks/use-safety-monitor.ts (runTest).
 */
import { useState } from "react"
import {
  AlertTriangle,
  Check,
  Circle,
  FlaskConical,
  Loader2,
  Minus,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  SystemTest,
  TestStep,
  TestStepId,
} from "@/hooks/use-safety-monitor"

const STEP_LABELS: Record<TestStepId, string> = {
  microphone: "Microphone",
  voice: "The monitor speaks",
  speech: "The monitor understands you",
  contacts: "Contacts get it, and their answer is heard here",
}

export function SystemTestCard({
  test,
  disabled,
  onRun,
  onClose,
}: {
  test: SystemTest | null
  /** A real alert is in progress: no test now. */
  disabled: boolean
  onRun: (options: { withContacts: boolean }) => void
  onClose: () => void
}) {
  const [withContacts, setWithContacts] = useState(true)

  return (
    <section
      className="grid gap-3 rounded-2xl border border-[#263d54] bg-[#0e1b2a] p-5"
      aria-label="Test the system"
    >
      <div className="flex items-center gap-2">
        <FlaskConical size={18} className="text-[#72def2]" />
        <h2 className="m-0 text-base font-semibold">Test the system</h2>
      </div>

      {!test ? (
        <>
          <p className="m-0 text-sm text-[#a7adb2]">
            The monitor asks a practice question out loud. Answer it to check
            the microphone and the voice. Nothing real is triggered.
          </p>
          <label className="flex items-start gap-2 text-sm text-[#d4e0ec]">
            <input
              className="mt-1"
              type="checkbox"
              checked={withContacts}
              onChange={(event) => setWithContacts(event.target.checked)}
            />
            <span>
              Also send a <b>TEST</b> alert to my contacts, so they can try the
              reply buttons. It never repeats or escalates.
            </span>
          </label>
          <Button
            className="h-11 bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5]"
            disabled={disabled}
            onClick={() => onRun({ withContacts })}
          >
            Run a test
          </Button>
          {disabled && (
            <p className="m-0 text-xs text-[#e2b78e]">
              A real alert is in progress. Test once it is over.
            </p>
          )}
        </>
      ) : (
        <>
          <ol className="m-0 grid list-none gap-2 p-0">
            {(Object.keys(STEP_LABELS) as TestStepId[]).map((id) => (
              <li className="flex gap-3" key={id}>
                <StepIcon status={test.steps[id].status} />
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-sm text-[#e8eef5]">
                    {STEP_LABELS[id]}
                  </span>
                  {test.steps[id].note && (
                    <span className="text-xs text-[#a7adb2]">
                      {test.steps[id].note}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            {!test.running && (
              <Button
                className="bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5]"
                disabled={disabled}
                onClick={() => onRun({ withContacts })}
              >
                Run again
              </Button>
            )}
            <Button
              className="border-[#263c53] bg-[#101e2d] text-[#d4e0ec] hover:bg-[#14283b]"
              variant="outline"
              onClick={onClose}
            >
              {test.running ? "Stop test" : "Close"}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

function StepIcon({ status }: { status: TestStep["status"] }) {
  const common = "mt-0.5 shrink-0"
  switch (status) {
    case "ok":
      return (
        <Check
          size={18}
          className={`${common} text-[#8fd0a6]`}
          aria-label="Passed"
        />
      )
    case "failed":
      return (
        <X
          size={18}
          className={`${common} text-[#f08f8f]`}
          aria-label="Failed"
        />
      )
    case "warn":
      return (
        <AlertTriangle
          size={18}
          className={`${common} text-[#e2b78e]`}
          aria-label="Needs attention"
        />
      )
    case "running":
      return (
        <Loader2
          size={18}
          className={`${common} animate-spin text-[#72def2]`}
          aria-label="Running"
        />
      )
    case "skipped":
      return (
        <Minus
          size={18}
          className={`${common} text-[#5f7184]`}
          aria-label="Skipped"
        />
      )
    default:
      return (
        <Circle
          size={18}
          className={`${common} text-[#3a4f64]`}
          aria-label="Waiting"
        />
      )
  }
}
