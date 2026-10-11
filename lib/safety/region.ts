/*
 * Settings that depend on the country rather than the language (Saudi Arabia).
 */

/** Saudi Arabia. 911 is the unified number in the main regions; the others work everywhere. */
export const EMERGENCY_NUMBERS = {
  unified: "911",
  ambulance: "997",
  civilDefence: "998",
  police: "999",
} as const
