/*
 * monitor-settings.ts: the monitor's settings remembered in this browser:
 * language, device token, and the setup answers (what to watch for and how
 * careful the AI should be).
 *
 * Why this file exists: the setup screen writes these and the monitor reads
 * them; keeping both sides on the same stores means one source of truth. They
 * live only in this browser, which is enough for one monitor per household.
 */
import {
  DEFAULT_PROFILE,
  MonitorProfileSchema,
  type MonitorProfile,
} from "@/lib/safety/profile"
import { isLanguage, type Language } from "@/lib/safety/languages"

import { createStoredValue } from "./stored-value"

export const languageStore = createStoredValue<Language>(
  "safety-monitor-language",
  "en",
  isLanguage
)

export const deviceTokenStore = createStoredValue<string>(
  "safety-monitor-device-token",
  "",
  (value): value is string => value.length > 0
)

/** The setup answers as JSON; empty until setup is finished. */
export const profileStore = createStoredValue<string>(
  "safety-monitor-profile",
  "",
  (value): value is string => value.length > 0
)

/** The saved setup answers, or null if setup has not been finished (or the saved value is unreadable). */
export function parseProfile(json: string): MonitorProfile | null {
  if (!json) return null
  try {
    const parsed = MonitorProfileSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveProfile(profile: MonitorProfile): void {
  profileStore.write(JSON.stringify(profile))
}

export { DEFAULT_PROFILE }
