/*
 * Sound classification with Google's YAMNet (521 classes, about 4 MB) running
 * in the browser through MediaPipe, behind a small interface so the model can
 * be replaced. Inference is local: no audio is sent anywhere and there is no
 * per-use cost.
 */
import {
  AudioClassifier,
  FilesetResolver,
  type AudioClassifierResult,
} from "@mediapipe/tasks-audio"

import type { SoundFrame } from "@/lib/safety/types"

import { MEDIAPIPE_WASM_URL, YAMNET_MODEL_URL } from "./audio-settings"

export interface SoundClassifier {
  /** Scores every known sound class for a clip of about one second. */
  classify(
    samples: Float32Array,
    sampleRate: number,
    timeMs: number
  ): SoundFrame
  close(): void
}

export async function createYamnetClassifier(): Promise<SoundClassifier> {
  const wasm = await FilesetResolver.forAudioTasks(MEDIAPIPE_WASM_URL)
  const classifier = await AudioClassifier.createFromOptions(wasm, {
    baseOptions: { modelAssetPath: YAMNET_MODEL_URL },
  })

  return {
    classify: (samples, sampleRate, timeMs) => ({
      timeMs,
      scores: highestScores(classifier.classify(samples, sampleRate)),
    }),
    close: () => classifier.close(),
  }
}

/** A clip can produce several results (one per ~1 s window); keep each label's highest score. */
export function highestScores(
  results: AudioClassifierResult[]
): Record<string, number> {
  const scores: Record<string, number> = {}
  for (const result of results) {
    for (const category of result.classifications[0]?.categories ?? []) {
      scores[category.categoryName] = Math.max(
        scores[category.categoryName] ?? 0,
        category.score
      )
    }
  }
  return scores
}

/** The strongest sounds in a frame, for the on-screen "what I hear" line used to tune thresholds. */
export function topSounds(
  frame: SoundFrame,
  count = 3
): { label: string; score: number }[] {
  return Object.entries(frame.scores)
    .map(([label, score]) => ({ label, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
}
