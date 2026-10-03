/*
 * incidents.ts: THE list of incidents the assistant listens for. Adding an
 * incident means adding one entry here; no other file names incident types.
 *
 * Why this file exists: the demo app only has canned chat replies
 * (components/alexa/data.ts). Nothing describes what to listen for, what to
 * ask, or how urgent each situation is.
 *
 * How to read an entry:
 * - triggerSounds: YAMNet class names, spelled exactly as YAMNet spells them.
 * - triggerPhrases: matched as whole words after normalising the text
 *   ("I've" = "I have", Arabic diacritics and letter variants ignored), so
 *   list each phrase once.
 * - confirmationQuestion: always an "are you okay?" question, so "yes" means
 *   "I'm fine" and "no" means "help".
 * - aiCheck: whether a trigger from that source is first transcribed and
 *   checked by the language model (to filter out the TV, for example). Falls,
 *   alarms and glass go straight to the question: there is nothing useful to
 *   transcribe, and speed matters more.
 * - No entry diagnoses anything. Labels describe what was heard or said.
 */
import type { IncidentDefinition, IncidentTypeId, Severity } from "./types"

export const INCIDENTS: IncidentDefinition[] = [
  {
    id: "smoke_co_alarm",
    label: "Smoke or carbon monoxide alarm",
    severity: "critical",
    triggerSounds: [
      { label: "Smoke detector, smoke alarm", minScore: 0.3 },
      { label: "Fire alarm", minScore: 0.3 },
    ],
    triggerPhrases: {
      en: ["there is a fire", "something is burning", "i smell smoke", "i smell gas"],
      ar: ["حريق", "فيه دخان", "ريحة غاز", "ريحة دخان"],
    },
    confirmationQuestion: {
      en: "I can hear a smoke or gas alarm. Are you okay?",
      ar: "أسمع صوت إنذار دخان أو غاز. هل أنت بخير؟",
    },
    aiCheck: { sound: false, speech: true },
    notifyOnCancel: true,
  },
  {
    id: "medical_distress",
    label: "Spoken medical distress",
    severity: "critical",
    triggerSounds: [],
    triggerPhrases: {
      en: [
        "i cannot breathe",
        "cannot breathe",
        "my chest hurts",
        "chest pain",
        "i feel dizzy",
        "i am dizzy",
        "i feel faint",
        "i am going to faint",
        "i am going to pass out",
      ],
      ar: [
        "ما أقدر أتنفس",
        "مو قادر أتنفس",
        "صدري يوجعني",
        "ألم في صدري",
        "دايخ",
        "دايخة",
        "أحس بدوخة",
        "بيغمى علي",
        "راح يغمى علي",
      ],
    },
    confirmationQuestion: {
      en: "It sounds like you may not feel well. Are you okay?",
      ar: "يبدو أنك لا تشعر بخير. هل أنت بخير؟",
    },
    aiCheck: { sound: false, speech: true },
    notifyOnCancel: false,
  },
  {
    id: "fall",
    label: "Possible fall",
    severity: "high",
    triggerSounds: [
      { label: "Thump, thud", minScore: 0.4 },
      { label: "Smash, crash", minScore: 0.4 },
    ],
    triggerPhrases: {
      en: ["i have fallen", "i fell", "i fell down", "i cannot get up"],
      ar: ["طحت", "وقعت", "سقطت", "ما أقدر أقوم", "مو قادر أقوم"],
    },
    confirmationQuestion: {
      en: "It sounded like something fell. Are you okay?",
      ar: "سمعت صوت سقوط. هل أنت بخير؟",
    },
    aiCheck: { sound: false, speech: true },
    notifyOnCancel: false,
  },
  {
    id: "help_call",
    label: "Call for help",
    severity: "high",
    triggerSounds: [],
    triggerPhrases: {
      en: [
        "help",
        "help me",
        "somebody help",
        "call my daughter",
        "call my son",
        "call my wife",
        "call my husband",
        "call an ambulance",
        "call 911",
        "call 997",
      ],
      ar: [
        "ساعدوني",
        "ساعدني",
        "الحقوني",
        "الحقني",
        "النجدة",
        "أحد يساعدني",
        "اتصلوا ببنتي",
        "اتصل على بنتي",
        "اتصل على ولدي",
        "اتصلوا بولدي",
        "اتصلوا بالإسعاف",
        "اتصل بالإسعاف",
      ],
    },
    confirmationQuestion: {
      en: "I heard someone ask for help. Are you okay?",
      ar: "سمعت أحدًا يطلب المساعدة. هل أنت بخير؟",
    },
    aiCheck: { sound: false, speech: true },
    notifyOnCancel: false,
  },
  {
    id: "screaming_crying",
    label: "Prolonged screaming or crying",
    severity: "high",
    triggerSounds: [
      { label: "Screaming", minScore: 0.4, sustainedMs: 5000 },
      { label: "Crying, sobbing", minScore: 0.4, sustainedMs: 8000 },
      { label: "Wail, moan", minScore: 0.4, sustainedMs: 8000 },
    ],
    triggerPhrases: { en: [], ar: [] },
    confirmationQuestion: {
      en: "I heard screaming or crying. Are you okay?",
      ar: "سمعت صراخًا أو بكاءً. هل أنت بخير؟",
    },
    aiCheck: { sound: true, speech: true },
    notifyOnCancel: false,
  },
  {
    id: "glass_break",
    label: "Glass breaking",
    severity: "medium",
    triggerSounds: [
      { label: "Shatter", minScore: 0.3 },
      { label: "Glass", minScore: 0.5 },
    ],
    triggerPhrases: { en: [], ar: [] },
    confirmationQuestion: {
      en: "I heard glass breaking. Are you okay?",
      ar: "سمعت صوت زجاج ينكسر. هل أنت بخير؟",
    },
    aiCheck: { sound: false, speech: true },
    notifyOnCancel: false,
  },
]

export function getIncident(id: IncidentTypeId): IncidentDefinition {
  const incident = INCIDENTS.find((entry) => entry.id === id)
  if (!incident) throw new Error(`Unknown incident type: ${id}`)
  return incident
}

/** Lower is more severe. Used to pick between simultaneous triggers. */
export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2 }

/** How long the person has to answer the confirmation question before we escalate. */
export const CONFIRMATION_TIMEOUT_MS = 30_000

/**
 * After "I'm fine", the same incident is ignored for this long. An alarm can
 * keep sounding for minutes; we ask again if it is still going after this.
 */
export const SNOOZE_AFTER_CANCEL_MS = 60_000
