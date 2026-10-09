/*
 * region.ts: settings that depend on where the household is (Saudi Arabia).
 *
 * Why this file exists: emergency numbers depend on the country, not the
 * language. A different country is a change to this file only. Everything
 * that depends on the language lives in the language packs
 * (lib/safety/languages).
 */

/** Saudi Arabia. 911 is the unified number in the main regions; the others work everywhere. */
export const EMERGENCY_NUMBERS = {
  unified: "911",
  ambulance: "997",
  civilDefence: "998",
  police: "999",
} as const
