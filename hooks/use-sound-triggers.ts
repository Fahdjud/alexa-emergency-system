/*
 * use-sound-triggers.ts: React hook that runs the sound classifier on the
 * live microphone audio about once a second and reports incident triggers.
 *
 * Why this file exists: the classifier (lib/audio/sound-classifier.ts) and
 * the matching rules (lib/safety/match-trigger.ts) are plain functions. This
 * hook connects them to the microphone stream from useAudioCapture and keeps
 * the short score history that "sustained" sounds (prolonged crying) need.
 */
import { useEffect, useRef, useState } from "react"

import type { ChunkListener } from "@/hooks/use-audio-capture"
import { CLASSIFY_EVERY_MS } from "@/lib/audio/audio-settings"
import {
  createYamnetClassifier,
  topSounds,
  type SoundClassifier,
} from "@/lib/audio/sound-classifier"
import { concatSamples } from "@/lib/audio/snippet"
import { addSoundFrame, matchSound } from "@/lib/safety/match-trigger"
import type {
  IncidentTypeId,
  SoundFrame,
  TriggerMatch,
} from "@/lib/safety/types"

/** The same incident is not reported again within this time (an alarm sounds for minutes). */
const SAME_INCIDENT_COOLDOWN_MS = 10_000

export type ClassifierStatus = "off" | "loading" | "ready" | "error"

type Options = {
  listening: boolean
  /** useAudioCapture().onChunk: must be stable across renders. */
  onChunk: (listener: ChunkListener) => () => void
  onTrigger: (match: TriggerMatch) => void
}

export function useSoundTriggers({ listening, onChunk, onTrigger }: Options) {
  const [status, setStatus] = useState<ClassifierStatus>("off")
  const [hearing, setHearing] = useState<{ label: string; score: number }[]>([])
  const classifierRef = useRef<SoundClassifier | null>(null)
  const onTriggerRef = useRef(onTrigger)

  useEffect(() => {
    onTriggerRef.current = onTrigger
  }, [onTrigger])

  // Load the model the first time listening starts, then keep it for the page's lifetime.
  useEffect(() => {
    if (!listening || classifierRef.current) return
    let cancelled = false
    setStatus("loading")
    createYamnetClassifier()
      .then((classifier) => {
        if (cancelled) return classifier.close()
        classifierRef.current = classifier
        setStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [listening])

  useEffect(() => () => classifierRef.current?.close(), [])

  // Classify each ~1 s of live audio and report matches.
  useEffect(() => {
    if (!listening || status !== "ready") return

    let pending: Float32Array[] = []
    let pendingSamples = 0
    let frames: SoundFrame[] = []
    const lastReported = new Map<IncidentTypeId, number>()

    const unsubscribe = onChunk((chunk, sampleRate) => {
      pending.push(chunk)
      pendingSamples += chunk.length
      if (pendingSamples < (sampleRate * CLASSIFY_EVERY_MS) / 1000) return

      const clip = concatSamples(pending)
      pending = []
      pendingSamples = 0

      const now = Date.now()
      const frame = classifierRef.current?.classify(clip, sampleRate, now)
      if (!frame) return
      frames = addSoundFrame(frames, frame)
      setHearing(topSounds(frame))

      for (const match of matchSound(frames)) {
        if (
          now - (lastReported.get(match.incidentId) ?? 0) <
          SAME_INCIDENT_COOLDOWN_MS
        )
          continue
        lastReported.set(match.incidentId, now)
        onTriggerRef.current(match)
      }
    })

    return () => {
      unsubscribe()
      setHearing([])
    }
  }, [onChunk, listening, status])

  return { status: listening ? status : "off", hearing }
}
