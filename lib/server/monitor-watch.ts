/*
 * monitor-watch.ts: records the monitor's heartbeats and tells contact 1 when
 * it goes offline, and again when it is back.
 *
 * Why this file exists: a closed tab or a dead tablet means nothing is
 * listening, and the family would never know. The rule for "offline" is
 * lib/safety/monitor-health.ts; this file stores heartbeats and sends the
 * messages. It uses the same injected dependencies as the escalation runner.
 */
import "server-only"

import { monitorHealth } from "@/lib/safety/monitor-health"

import { monitorBackText, monitorOfflineText } from "./alert-message"
import type { EscalationDeps } from "./escalation-runner"

export async function recordHeartbeat(deps: EscalationDeps, listening: boolean): Promise<void> {
  const previous = await deps.store.getMonitorStatus()
  await deps.store.saveMonitorStatus({ lastSeenMs: deps.nowMs, listening, offlineAlertSentAtMs: null })
  const wasReportedOffline = previous?.offlineAlertSentAtMs != null
  if (wasReportedOffline && listening) {
    await tellFirstContact(deps, monitorBackText())
  }
}

/** Called on every scheduler tick. Sends at most one "offline" message per outage. */
export async function checkMonitorHealth(deps: EscalationDeps): Promise<void> {
  const status = await deps.store.getMonitorStatus()
  if (!status || monitorHealth(status, deps.nowMs) !== "offline-alert-due") return
  await deps.store.saveMonitorStatus({ ...status, offlineAlertSentAtMs: deps.nowMs })
  await tellFirstContact(deps, monitorOfflineText(status.lastSeenMs))
}

async function tellFirstContact(deps: EscalationDeps, text: string): Promise<void> {
  const first = (await deps.store.listContacts()).find((contact) => deps.notifier.canReach(contact))
  if (!first) return
  await deps.notifier.send(first, { text }).catch((error) => console.error(`Message to ${first.name} failed`, error))
}
