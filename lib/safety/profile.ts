/*
 * profile.ts: the household's answers from the setup screen (what to watch
 * for, and how careful the AI should be) and the pure rules that turn them
 * into detection settings.
 *
 * Why this file exists: one fixed set of thresholds cannot suit every home.
 * Falls matter most for an older person living alone; a family with a baby
 * may switch crying off. Keeping the effect of each answer in small pure
 * functions makes it easy to test and to explain: "High" lowers that
 * incident's thresholds and always asks; "Off" ignores it.
 */
import { z } from "zod"

import { INCIDENTS } from "./incidents"
import type { IncidentDefinition, IncidentTypeId } from "./types"

export type Sensitivity = "off" | "normal" | "high"

/** How much the AI may second-guess a trigger before the person is asked. */
export type Carefulness = "always-ask" | "balanced" | "only-when-sure"

export type MonitorProfile = {
  incidents: Record<IncidentTypeId, Sensitivity>
  carefulness: Carefulness
}

const SensitivitySchema = z.enum(["off", "normal", "high"])

export const MonitorProfileSchema = z.object({
  incidents: z.object(
    Object.fromEntries(
      INCIDENTS.map((incident) => [incident.id, SensitivitySchema])
    ) as Record<IncidentTypeId, typeof SensitivitySchema>
  ),
  carefulness: z.enum(["always-ask", "balanced", "only-when-sure"]),
})

export const DEFAULT_PROFILE: MonitorProfile = {
  incidents: Object.fromEntries(
    INCIDENTS.map((incident) => [incident.id, "normal"])
  ) as Record<IncidentTypeId, Sensitivity>,
  carefulness: "balanced",
}

/** "High" makes sounds count from about 60% of their usual score and duration. */
const HIGH_SENSITIVITY_FACTOR = 0.6
/** "Only when sure" asks for about 25% stronger sounds before reacting. */
const ONLY_WHEN_SURE_FACTOR = 1.25
const MAX_MIN_SCORE = 0.95

/** The incidents config adjusted to this household: thresholds scaled, AI check set, "off" removed. */
export function applyProfile(
  profile: MonitorProfile,
  incidents: IncidentDefinition[] = INCIDENTS
): IncidentDefinition[] {
  return incidents
    .filter((incident) => profile.incidents[incident.id] !== "off")
    .map((incident) => {
      const high = profile.incidents[incident.id] === "high"
      const factor = high
        ? HIGH_SENSITIVITY_FACTOR
        : profile.carefulness === "only-when-sure"
          ? ONLY_WHEN_SURE_FACTOR
          : 1
      const alwaysAsk = high || profile.carefulness === "always-ask"
      return {
        ...incident,
        triggerSounds: incident.triggerSounds.map((trigger) => ({
          ...trigger,
          minScore: Math.min(MAX_MIN_SCORE, trigger.minScore * factor),
          sustainedMs: trigger.sustainedMs && trigger.sustainedMs * factor,
        })),
        aiCheck: alwaysAsk ? { sound: false, speech: false } : incident.aiCheck,
      }
    })
}

/**
 * How sure the AI must be that nothing is wrong before the question is skipped.
 * "always-ask" never skips (the AI check is not even run).
 */
export function dismissThreshold(carefulness: Carefulness): number | null {
  if (carefulness === "always-ask") return null
  return carefulness === "balanced" ? 0.9 : 0.75
}

/** Falls are hard to hear; at "High" any sudden loud impact also counts as a possible fall. */
export function watchesForImpacts(profile: MonitorProfile): boolean {
  return profile.incidents.fall === "high"
}
