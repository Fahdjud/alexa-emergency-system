/*
 * Speech-to-text with Whisper large-v3-turbo on Groq: fast, inexpensive
 * (well under a cent per snippet) and good with Arabic and English.
 */
import "server-only"

import { requireEnv } from "@/lib/server/env"
import type { Language } from "@/lib/safety/types"

import type { SpeechToText } from "./speech-to-text"

const GROQ_TRANSCRIPTION_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions"
const MODEL = "whisper-large-v3-turbo"
const TIMEOUT_MS = 10_000

export function createGroqSpeechToText(): SpeechToText {
  return {
    async transcribe(audio: Blob, language: Language): Promise<string> {
      const form = new FormData()
      form.append("file", audio, "snippet.wav")
      form.append("model", MODEL)
      form.append("language", language) // ISO-639-1: "en" or "ar"
      form.append("response_format", "json")
      form.append("temperature", "0")

      const response = await fetch(GROQ_TRANSCRIPTION_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${requireEnv("GROQ_API_KEY")}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok)
        throw new Error(
          `Groq transcription failed with status ${response.status}`
        )

      const body = (await response.json()) as { text?: unknown }
      return typeof body.text === "string" ? body.text.trim() : ""
    },
  }
}
