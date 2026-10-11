// Tests for turning the setup answers into detection settings.
import { describe, expect, it } from "vitest"

import { getIncident } from "./incidents"
import {
  applyProfile,
  DEFAULT_PROFILE,
  dismissThreshold,
  MonitorProfileSchema,
  watchesForImpacts,
  type MonitorProfile,
} from "./profile"

const withIncident = (
  id: keyof MonitorProfile["incidents"],
  sensitivity: MonitorProfile["incidents"][typeof id],
  carefulness: MonitorProfile["carefulness"] = "balanced"
): MonitorProfile => ({
  incidents: { ...DEFAULT_PROFILE.incidents, [id]: sensitivity },
  carefulness,
})

const find = (profile: MonitorProfile, id: string) =>
  applyProfile(profile).find((incident) => incident.id === id)

describe("applyProfile", () => {
  it("keeps the config unchanged for the default profile", () => {
    expect(find(DEFAULT_PROFILE, "fall")).toEqual(getIncident("fall"))
  })

  it("removes incidents switched off", () => {
    expect(
      find(withIncident("screaming_crying", "off"), "screaming_crying")
    ).toBeUndefined()
  })

  it("lowers thresholds and always asks at High", () => {
    const fall = find(withIncident("fall", "high"), "fall")!
    expect(fall.triggerSounds[0].minScore).toBeCloseTo(0.24)
    expect(fall.aiCheck).toEqual({ sound: false, speech: false })
    const crying = find(
      withIncident("screaming_crying", "high"),
      "screaming_crying"
    )!
    expect(crying.triggerSounds[0].sustainedMs).toBe(3000)
  })

  it("raises thresholds when only sure alerts are wanted", () => {
    const glass = find(
      withIncident("glass_break", "normal", "only-when-sure"),
      "glass_break"
    )!
    expect(glass.triggerSounds[0].minScore).toBeCloseTo(0.375)
  })

  it("never runs the AI check when the household wants to be asked every time", () => {
    for (const incident of applyProfile({
      ...DEFAULT_PROFILE,
      carefulness: "always-ask",
    })) {
      expect(incident.aiCheck).toEqual({ sound: false, speech: false })
    }
  })
})

describe("dismissThreshold and impacts", () => {
  it("maps carefulness to how sure the AI must be", () => {
    expect(dismissThreshold("always-ask")).toBeNull()
    expect(dismissThreshold("balanced")).toBe(0.9)
    expect(dismissThreshold("only-when-sure")).toBe(0.75)
  })

  it("watches for loud impacts only when falls are High", () => {
    expect(watchesForImpacts(DEFAULT_PROFILE)).toBe(false)
    expect(watchesForImpacts(withIncident("fall", "high"))).toBe(true)
  })

  it("validates stored profiles", () => {
    expect(MonitorProfileSchema.safeParse(DEFAULT_PROFILE).success).toBe(true)
    expect(
      MonitorProfileSchema.safeParse({ carefulness: "balanced" }).success
    ).toBe(false)
  })
})
