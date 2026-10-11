/*
 * Typed access to the server's environment variables. The "server-only"
 * import makes the build fail if this module is ever imported by client code.
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
