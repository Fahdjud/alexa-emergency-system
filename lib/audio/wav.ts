/*
 * Encodes samples as a 16-bit mono WAV file. MediaRecorder only produces
 * compressed, browser-specific formats; WAV is accepted by every
 * speech-to-text API and by Telegram.
 */

/** Samples are floats in [-1, 1]; values outside are clipped. */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number
): ArrayBuffer {
  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeText(view, 0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeText(view, 8, "WAVE")
  writeText(view, 12, "fmt ")
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true) // byte rate
  view.setUint16(32, bytesPerSample, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeText(view, 36, "data")
  view.setUint32(40, dataSize, true)

  samples.forEach((sample, index) => {
    const clipped = Math.max(-1, Math.min(1, sample))
    view.setInt16(
      44 + index * bytesPerSample,
      clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff,
      true
    )
  })
  return buffer
}

function writeText(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++)
    view.setUint8(offset + i, text.charCodeAt(i))
}
