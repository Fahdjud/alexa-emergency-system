/*
 * monitor-health.ts: decides from the monitor's heartbeats whether it is
 * running, deliberately paused, or silently offline.
 *
 * Why this file exists: if the monitor tab closes, the microphone is blocked
 * or the device loses power, nothing listens, and "no alerts" looks the same
 * as "all is well". The server therefore expects a heartbeat every minute and
 * tells contact 1 when it stops. Pressing "Stop listening" is a deliberate
 * pause, not an outage, so it does not alert.
 */

export const HEARTBEAT_EVERY_MS = 60_000
/** Several missed heartbeats in a row before anyone is told: avoids alerts for a brief network blip. */
export const OFFLINE_AFTER_MS = 5 * 60_000

export type MonitorStatus = {
  lastSeenMs: number
  listening: boolean
  /** When the "monitor offline" message was sent, or null. Cleared when the monitor comes back. */
  offlineAlertSentAtMs: number | null
}

export type MonitorHealth =
  "running" | "paused" | "offline-alert-due" | "offline-alerted"

export function monitorHealth(
  status: MonitorStatus | null,
  nowMs: number
): MonitorHealth | null {
  if (!status) return null // never set up: nothing to report
  if (!status.listening) return "paused"
  if (nowMs - status.lastSeenMs < OFFLINE_AFTER_MS) return "running"
  return status.offlineAlertSentAtMs === null
    ? "offline-alert-due"
    : "offline-alerted"
}
