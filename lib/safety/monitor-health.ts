/*
 * Decides from heartbeats whether the monitor is running, deliberately paused
 * or offline. A closed tab or a device without power looks the same as a quiet
 * home, so the server expects a heartbeat every minute and warns the first
 * contact when they stop. Pausing on purpose sends a final "not listening"
 * beat and does not raise a warning.
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
