/*
 * use-audio-capture.ts: React hook that runs the microphone, keeps the last
 * BUFFER_SECONDS of audio in memory, and builds trigger snippets on request.
 *
 * Why this file exists: the existing AlexaAssistant keeps its voice logic
 * private and only handles one sentence at a time. Later steps (sound
 * classifier, keyword spotting) subscribe to the same chunks via onChunk.
 *
 * Privacy: audio only ever lives in the ring buffer, which is constantly
 * overwritten and cleared on stop. Nothing is saved or sent here.
 */
import { useCallback, useEffect, useRef, useState } from "react"

import {
  AFTER_TRIGGER_SECONDS,
  BUFFER_SECONDS,
} from "@/lib/audio/audio-settings"
import { loudness } from "@/lib/audio/level"
import {
  describeMicrophoneError,
  startMicrophone,
  type MicrophoneSession,
} from "@/lib/audio/microphone"
import { RingBuffer } from "@/lib/audio/ring-buffer"
import { SnippetCollector } from "@/lib/audio/snippet"

export type CaptureStatus = "off" | "starting" | "on" | "error"

export type AudioClip = { samples: Float32Array; sampleRate: number }

export type ChunkListener = (chunk: Float32Array, sampleRate: number) => void

export function useAudioCapture() {
  const [status, setStatus] = useState<CaptureStatus>("off")
  const [level, setLevel] = useState(0)
  const [error, setError] = useState("")

  const sessionRef = useRef<MicrophoneSession | null>(null)
  const bufferRef = useRef<RingBuffer | null>(null)
  const listenersRef = useRef(new Set<ChunkListener>())

  const stop = useCallback(() => {
    sessionRef.current?.stop()
    sessionRef.current = null
    bufferRef.current?.clear()
    bufferRef.current = null
    setLevel(0)
    setStatus("off")
  }, [])

  const start = useCallback(async () => {
    if (sessionRef.current) return
    setStatus("starting")
    setError("")
    try {
      const session = await startMicrophone((chunk) => {
        bufferRef.current?.push(chunk)
        setLevel(loudness(chunk))
        for (const listener of listenersRef.current)
          listener(chunk, session.sampleRate)
      })
      sessionRef.current = session
      bufferRef.current = new RingBuffer(session.sampleRate * BUFFER_SECONDS)
      setStatus("on")
    } catch (startError) {
      setError(describeMicrophoneError(startError))
      setStatus("error")
    }
  }, [])

  useEffect(() => stop, [stop])

  /** Subscribe to live audio chunks. Returns the unsubscribe function. */
  const onChunk = useCallback((listener: ChunkListener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  /** The buffered audio before now (up to BUFFER_SECONDS). */
  const recentAudio = useCallback((): AudioClip | null => {
    const session = sessionRef.current
    const buffer = bufferRef.current
    return session && buffer
      ? { samples: buffer.snapshot(), sampleRate: session.sampleRate }
      : null
  }, [])

  /** The buffered audio plus the next AFTER_TRIGGER_SECONDS. Resolves to null if capture stops first. */
  const captureSnippet = useCallback(
    (afterSeconds = AFTER_TRIGGER_SECONDS): Promise<AudioClip | null> => {
      const before = recentAudio()
      if (!before) return Promise.resolve(null)

      return new Promise((resolve) => {
        const collector = new SnippetCollector(
          before.samples,
          before.sampleRate * afterSeconds
        )
        const finish = (clip: AudioClip | null) => {
          clearInterval(stopWatch)
          unsubscribe()
          resolve(clip)
        }
        const unsubscribe = onChunk((chunk) => {
          if (collector.add(chunk))
            finish({
              samples: collector.result(),
              sampleRate: before.sampleRate,
            })
        })
        const stopWatch = setInterval(() => {
          if (!sessionRef.current) finish(null)
        }, 500)
      })
    },
    [onChunk, recentAudio]
  )

  return {
    status,
    level,
    error,
    start,
    stop,
    onChunk,
    recentAudio,
    captureSnippet,
  }
}
