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

/** How often the sound classifier runs. YAMNet looks at ~1 s windows. */
export const CLASSIFY_EVERY_MS = 1000

/**
 * MediaPipe's WebAssembly runtime. The version must match @mediapipe/tasks-audio
 * in package.json; update both together.
 */
export const MEDIAPIPE_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@1.0.1/wasm"

/** Google's hosted YAMNet model (float32, ~4 MB), downloaded once per page load. */
export const YAMNET_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite"
