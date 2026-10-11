/*
 * RMS loudness of an audio chunk on a 0-1 scale, for the level meter and the
 * impact detector.
 */

/** Root-mean-square loudness, scaled so normal speech sits around the middle of the meter. */
export function loudness(chunk: Float32Array): number {
  if (chunk.length === 0) return 0
  let sumOfSquares = 0
  for (const sample of chunk) sumOfSquares += sample * sample
  const rms = Math.sqrt(sumOfSquares / chunk.length)
  return Math.min(1, rms * 4)
}
