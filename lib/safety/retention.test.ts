// Tests for how long snippets and records are kept.
import { describe, expect, it } from "vitest"

import { recordExpiresAtMs, snippetExpiresAtMs } from "./retention"

const DAY = 24 * 60 * 60 * 1000

describe("retention", () => {
  it("keeps escalated snippets 30 days and others 7 days", () => {
    expect(snippetExpiresAtMs({ createdAtMs: 0, escalated: true })).toBe(30 * DAY)
    expect(snippetExpiresAtMs({ createdAtMs: 0, escalated: false })).toBe(7 * DAY)
  })

  it("keeps incident records 90 days", () => {
    expect(recordExpiresAtMs({ createdAtMs: DAY })).toBe(91 * DAY)
  })
})
