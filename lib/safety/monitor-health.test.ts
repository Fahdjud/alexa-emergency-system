// Tests for deciding when the monitor counts as offline.
import { describe, expect, it } from "vitest"

import { monitorHealth, OFFLINE_AFTER_MS } from "./monitor-health"

describe("monitorHealth", () => {
  const seen = { lastSeenMs: 0, listening: true, offlineAlertSentAtMs: null }

  it("is running while heartbeats arrive", () => {
    expect(monitorHealth(seen, OFFLINE_AFTER_MS - 1)).toBe("running")
  })

  it("asks for one offline alert after heartbeats stop", () => {
    expect(monitorHealth(seen, OFFLINE_AFTER_MS)).toBe("offline-alert-due")
    expect(monitorHealth({ ...seen, offlineAlertSentAtMs: OFFLINE_AFTER_MS }, OFFLINE_AFTER_MS * 3)).toBe("offline-alerted")
  })

  it("never alerts for a deliberate pause or a monitor that was never set up", () => {
    expect(monitorHealth({ ...seen, listening: false }, OFFLINE_AFTER_MS * 10)).toBe("paused")
    expect(monitorHealth(null, 0)).toBeNull()
  })
})
