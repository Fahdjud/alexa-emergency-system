/*
 * pack.ts: the shape of a language pack, the one file that teaches the
 * assistant a language.
 *
 * Why this file exists: every word the assistant listens for or says in a
 * language lives in that language's pack, so adding a language is one new
 * file plus one line in languages/index.ts. Nothing else in the app names a
 * language. Speech recognition (Chrome), transcription (Whisper) and the AI
 * check (Claude) already work in many languages; what a new language needs is
 * the phrases below, written by a native speaker.
 */
import type { IncidentTypeId, ReplyIntent } from "../types"

export type LanguagePack = {
  /** ISO 639-1 code, also sent to speech-to-text ("en", "ar", "ur", ...). */
  code: string
  /** The language's name in English, for docs and logs. */
  name: string
  /** The language's name in itself, shown on the language switch. */
  nativeName: string
  /** BCP 47 tag for Chrome speech recognition and speech output, e.g. "ar-SA". */
  speechTag: string
  direction: "ltr" | "rtl"

  /** What to listen for, and the question to ask, per incident. */
  incidents: Record<IncidentTypeId, IncidentWords>

  /**
   * Everyday phrases that contain a trigger but mean something else
   * ("I fell asleep", "help me with my homework"). They are removed from the
   * text before matching.
   */
  ignorePhrases: string[]

  /** Answers to "Are you okay?". A help phrase always wins over a fine phrase. */
  replies: { fine: string[]; help: string[] }

  /** Everything the device says, apart from the incident questions. */
  lines: {
    /** Said after every question, so the person knows how to answer. */
    replyHint: string
    cancelled: string
    escalated: string
    /** Nobody acknowledged after every round of alerts. */
    unacknowledged: string
    /** A contact tapped "I'm handling it". */
    handling: (name: string) => string
    /** A contact tapped "On my way". */
    onTheWay: (name: string) => string
    /** A contact tapped "Calling you now". */
    calling: (name: string) => string
  }

  /**
   * Test sentences for the accuracy scorecard (pnpm scorecard). Write them
   * as people really talk, including hard cases.
   */
  samples: {
    /** Should trigger this incident. */
    triggers: { text: string; incident: IncidentTypeId }[]
    /** Everyday speech that must not trigger anything. */
    everyday: string[]
    /** Answers to "Are you okay?" and how they must be read. */
    replies: { text: string; intent: ReplyIntent }[]
  }
}

export type IncidentWords = {
  /** Matched as whole words after normalising (see normalize-text.ts). */
  phrases: string[]
  /** Looser trigger: one word from each list, in any order ("my HEAD really HURTS"). */
  wordPairs?: [string[], string[]]
  /** A yes/no "are you okay?" question: "yes" is read as "I'm fine". */
  question: string
}
