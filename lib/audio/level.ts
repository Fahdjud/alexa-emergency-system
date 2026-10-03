/*
 * level.ts: turns a chunk of audio into a 0-1 loudness value for the level meter.
 *
 * Why this file exists: the monitor page shows that the microphone is really
 * hearing the room. Without a meter, a muted or unplugged mic looks the same
 * as a quiet room.
 */

/** Root-mean-square loudness, scaled so normal speech sits around the middle of the meter. */
export function loudness(chunk: Float32Array): number {
  if (chunk.length === 0) return 0
  let sumOfSquares = 0
  for (const sample of chunk) sumOfSquares += sample * sample
  const rms = Math.sqrt(sumOfSquares / chunk.length)
  return Math.min(1, rms * 4)
}
