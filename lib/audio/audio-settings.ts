/*
 * audio-settings.ts: the numbers that shape audio capture.
 *
 * Why this file exists: the demo app never touches raw audio. These values
 * are shared by the capture code, the sound classifier and the snippet
 * upload, so they live in one place.
 */

/** 16 kHz mono is what YAMNet and Whisper expect, and keeps snippets small (~32 KB per second as WAV). */
export const TARGET_SAMPLE_RATE = 16_000

/** Rolling buffer length: audio from before a trigger. Kept in memory only and constantly overwritten. */
export const BUFFER_SECONDS = 15

/** How much audio to keep recording after a trigger, so the snippet includes what was said next. */
export const AFTER_TRIGGER_SECONDS = 6

/** The capture worklet posts audio in chunks of this length (ms). */
export const CHUNK_MS = 100
