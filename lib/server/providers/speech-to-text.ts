/*
 * speech-to-text.ts: the SpeechToText interface and the factory that picks
 * the configured provider (STT_PROVIDER).
 *
 * Why this file exists: the app had no transcription. The browser's speech
 * recognition cannot transcribe a recorded snippet, so the snippet is sent
 * here. Keeping the provider behind an interface means Groq can be swapped
 * (OpenAI, Deepgram, on-device Whisper) by adding one file.
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
