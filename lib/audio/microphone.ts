/*
 * microphone.ts: opens the microphone and streams raw 16 kHz samples to a
 * callback.
 *
 * Why this file exists: the existing voice input (Web Speech API in
 * components/alexa/alexa-assistant.tsx) gives text only, for one sentence at a
 * time. Continuous listening needs the raw stream.
 */
import { CHUNK_MS, TARGET_SAMPLE_RATE } from "./audio-settings"

export type MicrophoneSession = {
  /** The real rate. Chrome honours 16 kHz; other browsers may not. */
  sampleRate: number
  stop: () => void
}

export async function startMicrophone(onChunk: (chunk: Float32Array) => void): Promise<MicrophoneSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    // Browser speech processing is tuned for calls: it suppresses alarms, bangs and screams.
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })

  try {
    const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
    await context.audioWorklet.addModule("/audio/capture-worklet.js")
    const source = context.createMediaStreamSource(stream)
    const capture = new AudioWorkletNode(context, "capture-processor", {
      numberOfOutputs: 0, // a sink: nothing is played back
      processorOptions: { chunkSize: Math.round((context.sampleRate * CHUNK_MS) / 1000) },
    })
    capture.port.onmessage = (event: MessageEvent<Float32Array>) => onChunk(event.data)
    source.connect(capture)

    return {
      sampleRate: context.sampleRate,
      stop: () => {
        capture.port.onmessage = null
        source.disconnect()
        stream.getTracks().forEach((track) => track.stop())
        void context.close()
      },
    }
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    throw error
  }
}

/** A short, human message for why the microphone could not start. */
export function describeMicrophoneError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ""
  if (name === "NotAllowedError") return "Microphone access is blocked. Allow it in the browser's site settings, then try again."
  if (name === "NotFoundError") return "No microphone was found. Connect one, then try again."
  if (name === "NotReadableError") return "The microphone is in use by another app. Close it, then try again."
  if (!window.isSecureContext) return "The microphone only works over https:// or on localhost."
  return "The microphone could not start. Check your microphone settings, then try again."
}
