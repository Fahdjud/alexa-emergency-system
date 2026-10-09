/*
 * schemas.ts: runtime validation for data that crosses the network: triggers
 * sent by the monitor page, and the classification the server returns.
 *
 * Why this file exists: TypeScript types vanish at runtime. Anything arriving
 * over HTTP is untrusted, so the API routes validate it with these schemas,
 * and the client validates the response the same way.
 */
import { z } from "zod"

import { INCIDENTS } from "./incidents"
import { LANGUAGES, type Language } from "./languages"
import type { IncidentTypeId } from "./types"

const incidentIds = INCIDENTS.map((incident) => incident.id) as [
  IncidentTypeId,
  ...IncidentTypeId[],
]

export const LanguageSchema = z.enum(LANGUAGES as [Language, ...Language[]])
export const IncidentTypeIdSchema = z.enum(incidentIds)
export const SeveritySchema = z.enum(["critical", "high", "medium"])

export const TriggerMatchSchema = z.discriminatedUnion("source", [
  z.object({
    incidentId: IncidentTypeIdSchema,
    source: z.literal("sound"),
    label: z.string().max(200),
    score: z.number().min(0).max(1),
  }),
  z.object({
    incidentId: IncidentTypeIdSchema,
    source: z.literal("speech"),
    phrase: z.string().max(200),
    language: LanguageSchema,
  }),
])

export const ClassificationSchema = z.object({
  /** "none": the language model is confident nothing is wrong (e.g. the TV). */
  incidentType: z.union([IncidentTypeIdSchema, z.literal("none")]),
  severity: SeveritySchema.nullable(),
  confidence: z.number().min(0).max(1),
  /** Exact words from the transcript that support the decision, or null. */
  supportingQuote: z.string().nullable(),
  /** Which classifier produced this, so the incident log can show it. */
  source: z.enum(["anthropic", "rules"]),
})

export type Classification = z.infer<typeof ClassificationSchema>

export const AiCheckResponseSchema = z.object({
  transcript: z.string(),
  classification: ClassificationSchema,
  isIncident: z.boolean(),
})

export type AiCheckResponse = z.infer<typeof AiCheckResponseSchema>
