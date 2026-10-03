/*
 * escalation-deps.ts: builds the real dependencies for the escalation runner
 * (configured store, notifier, clock, secrets) for API routes.
 *
 * Why this file exists: the runner takes its dependencies as an argument so
 * tests can pass fakes. Routes call this instead of repeating the wiring.
 */
import "server-only"

import { appBaseUrl } from "./app-url"
import { requireEnv } from "./env"
import type { EscalationDeps } from "./escalation-runner"
import { getNotifier } from "./providers/notifier"
import { getStore } from "./providers/store"

export async function escalationDeps(): Promise<EscalationDeps> {
  return {
    store: await getStore(),
    notifier: getNotifier(),
    nowMs: Date.now(),
    ackSecret: requireEnv("ACK_TOKEN_SECRET"),
    baseUrl: appBaseUrl(),
  }
}
