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
import { ImpactDetector } from "@/lib/audio/impact-detector"
import { loudness } from "@/lib/audio/level"
import {
  addSoundFrame,
  matchSound,
  soundHistoryMs,
} from "@/lib/safety/match-trigger"
import type {
  IncidentDefinition,
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
  /** The incidents config adjusted to the household (lib/safety/profile.ts). */
  incidents: IncidentDefinition[]
  /** Also report any sudden loud impact as a possible fall (falls set to "High"). */
  detectImpacts: boolean
}

export function useSoundTriggers({
  listening,
  onChunk,
  onTrigger,
  incidents,
  detectImpacts,
}: Options) {
  const [status, setStatus] = useState<ClassifierStatus>("off")
  const [hearing, setHearing] = useState<{ label: string; score: number }[]>([])
  const classifierRef = useRef<SoundClassifier | null>(null)
  const onTriggerRef = useRef(onTrigger)
  const settingsRef = useRef({ incidents, detectImpacts })

  useEffect(() => {
    onTriggerRef.current = onTrigger
    settingsRef.current = { incidents, detectImpacts }
  }, [onTrigger, incidents, detectImpacts])

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
    const impacts = new ImpactDetector()

    const report = (match: TriggerMatch, now: number) => {
      if (
        now - (lastReported.get(match.incidentId) ?? 0) <
        SAME_INCIDENT_COOLDOWN_MS
      )
        return
      lastReported.set(match.incidentId, now)
      onTriggerRef.current(match)
    }

    const unsubscribe = onChunk((chunk, sampleRate) => {
      const { incidents, detectImpacts } = settingsRef.current
      const impactPeak = impacts.push(loudness(chunk), Date.now())
      if (impactPeak !== null && detectImpacts) {
        report(
          {
            incidentId: "fall",
            source: "sound",
            label: "Sudden loud impact",
            score: impactPeak,
          },
          Date.now()
        )
      }

      pending.push(chunk)
      pendingSamples += chunk.length
      if (pendingSamples < (sampleRate * CLASSIFY_EVERY_MS) / 1000) return

      const clip = concatSamples(pending)
      pending = []
      pendingSamples = 0

      const now = Date.now()
      const frame = classifierRef.current?.classify(clip, sampleRate, now)
      if (!frame) return
      frames = addSoundFrame(frames, frame, soundHistoryMs(incidents))
      setHearing(topSounds(frame))

      for (const match of matchSound(frames, incidents)) report(match, now)
    })

    return () => {
      unsubscribe()
      setHearing([])
    }
  }, [onChunk, listening, status])

  return { status: listening ? status : "off", hearing }
}
