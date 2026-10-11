/*
 * Builds the production dependencies for the escalation runner (store,
 * notifier, clock, secrets, email). Tests pass their own.
 */
import "server-only"

import { appBaseUrl } from "./app-url"
import { emailAlertsConfigured, emailIncident } from "./email-alert"
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
    emailAlert: emailAlertsConfigured() ? emailIncident : undefined,
  }
}
