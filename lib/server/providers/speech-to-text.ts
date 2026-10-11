/*
 * SpeechToText interface and provider selection (STT_PROVIDER). Browser
 * recognition cannot transcribe a recorded snippet, so snippets are
 * transcribed on the server.
 */
import "server-only"

import { getSttProvider } from "@/lib/server/env"
import type { Language } from "@/lib/safety/types"

import { createGroqSpeechToText } from "./stt-groq"

export interface SpeechToText {
  /** Returns the transcript, or "" when nothing was said. */
  transcribe(audio: Blob, language: Language): Promise<string>
}

const noTranscription: SpeechToText = { transcribe: async () => "" }

export function getSpeechToText(): SpeechToText {
  return getSttProvider() === "groq"
    ? createGroqSpeechToText()
    : noTranscription
}
