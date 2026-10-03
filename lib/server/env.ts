/*
 * env.ts: the only place server code reads process.env for the safety assistant.
 *
 * Why this file exists: the app had no server-side configuration. Keeping env
 * access in one file means secrets are read in one place, and the
 * "server-only" import makes the build fail if this file is ever imported into
 * browser code. Later PRs add typed readers for each provider here.
 */
import "server-only"

import { checkEnvironment, type EnvReport } from "./env-checks"

/** Presence and shape of every variable. Contains no values, so it is safe to return to an authorised caller. */
export function getEnvReport(): EnvReport {
  return checkEnvironment(process.env)
}

/** The device token the monitor page must send, or undefined if it is not configured. */
export function getMonitorDeviceToken(): string | undefined {
  return process.env.MONITOR_DEVICE_TOKEN || undefined
}

export function getSttProvider(): "groq" | "none" {
  return process.env.STT_PROVIDER === "none" ? "none" : "groq"
}

export function getClassifierProvider(): "anthropic" | "rules" {
  return process.env.CLASSIFIER_PROVIDER === "rules" ? "rules" : "anthropic"
}

/** Throws a clear error naming the variable, instead of a confusing provider error later. */
export function requireEnv(
  name:
    | "ANTHROPIC_API_KEY"
    | "GROQ_API_KEY"
    | "ACK_TOKEN_SECRET"
    | "CRON_SECRET"
    | "TELEGRAM_WEBHOOK_SECRET"
    | "SUPABASE_URL"
    | "SUPABASE_SERVICE_ROLE_KEY"
): string {
  const value = process.env[name]
  if (!value)
    throw new Error(
      `${name} is not set. Add it to .env.local (or Vercel) and restart.`
    )
  return value
}
