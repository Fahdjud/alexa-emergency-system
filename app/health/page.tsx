"use client"

/*
 * /health: shows which environment variables this deployment can read, and
 * whether each is well formed, without revealing any value.
 */
import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { CheckStatus, EnvReport } from "@/lib/server/env-checks"

const statusIcon: Record<CheckStatus, string> = {
  ok: "✅",
  warning: "⚠️",
  missing: "❌",
  invalid: "❌",
}

export default function HealthPage() {
  const [report, setReport] = useState<EnvReport | null>(null)
  const [error, setError] = useState("")
  const [checking, setChecking] = useState(false)

  async function runCheck() {
    setChecking(true)
    setError("")
    setReport(null)
    try {
      const response = await fetch("/api/health/config")
      const body = await response.json()
      if (response.ok) setReport(body)
      else setError(body.error ?? `Request failed (${response.status}).`)
    } catch {
      setError("Could not reach the server.")
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className="min-h-dvh bg-[#0b1421] px-4 py-10 text-[#f3f6fa]">
      <div className="mx-auto max-w-2xl">
        <h1 className="m-0 text-2xl font-normal">Configuration check</h1>
        <p className="mt-2 text-sm text-[#a7adb2]">
          Shows whether each variable is set and correctly shaped on this
          deployment. Values are never shown.
        </p>

        <Button
          className="mt-6 bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5]"
          type="button"
          onClick={runCheck}
          disabled={checking}
        >
          {checking ? "Checking..." : "Check configuration"}
        </Button>

        {error && (
          <p className="mt-4 text-sm text-[#e2b78e]" role="alert">
            {error}
          </p>
        )}
        {report && <ReportView report={report} />}
      </div>
    </main>
  )
}

function ReportView({ report }: { report: EnvReport }) {
  return (
    <section className="mt-6 grid gap-5" aria-live="polite">
      <p className="m-0 text-sm text-[#b3c0ce]">
        Deployment: <strong>{report.deployment}</strong>
        {Object.entries(report.readyFor).map(([step, ready]) => (
          <span className="ml-3" key={step}>
            {ready ? "✅" : "❌"} {step}
          </span>
        ))}
      </p>

      {report.problems.length > 0 && (
        <ul className="m-0 grid gap-1 rounded-md border border-[#5a3b2a] bg-[#2a1c14] p-3 pl-7 text-sm text-[#f1c9a5]">
          {report.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <table className="w-full border-collapse text-left text-sm">
        <thead className="text-xs text-[#858b92]">
          <tr>
            <th className="py-1 font-normal">Variable</th>
            <th className="py-1 font-normal">Group</th>
            <th className="py-1 font-normal">Needed for</th>
          </tr>
        </thead>
        <tbody>
          {report.variables.map((variable) => (
            <tr
              className="border-t border-[#23354a] align-top"
              key={variable.name}
            >
              <td className="py-2 pr-3">
                <span className="mr-2">{statusIcon[variable.status]}</span>
                <code className="text-[13px]">{variable.name}</code>
                {variable.status === "missing" && (
                  <span className="block text-xs text-[#e2b78e]">Not set.</span>
                )}
                {variable.hint && (
                  <span className="block text-xs text-[#a7adb2]">
                    {variable.hint}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-[#b3c0ce]">{variable.group}</td>
              <td className="py-2 text-[#b3c0ce]">{variable.neededFor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
