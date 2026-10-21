/*
 * Plays recorded prompts through one shared audio element. iPhones and iPads
 * only let a page start audio from a tap, but an element that has played once
 * after a tap may keep playing later (after a timer or a server reply). So
 * every prompt reuses this element, and the first tap anywhere on the page
 * unlocks it with a short silent clip. Speech synthesis is unlocked at the
 * same time, for the browser-voice fallback.
 */

export type PlayResult = "played" | "failed" | "stopped"

const SILENCE_URL = "/audio/silence.wav"
/** A clip that never reports "ended" is given up on after this long. */
const MAX_CLIP_MS = 15_000

let element: HTMLAudioElement | null = null
let finishCurrent: ((result: PlayResult) => void) | null = null

function player(): HTMLAudioElement {
  element ??= new Audio()
  return element
}

/** Plays one clip. Resolves when it ends, fails, or is stopped. */
export function playClip(url: string): Promise<PlayResult> {
  if (typeof Audio === "undefined") return Promise.resolve("failed")
  stopClip()
  const audio = player()
  audio.muted = false
  audio.src = url
  return new Promise((resolve) => {
    const finish = (result: PlayResult) => {
      if (finishCurrent !== finish) return
      finishCurrent = null
      clearTimeout(timeout)
      audio.onended = null
      audio.onerror = null
      resolve(result)
    }
    finishCurrent = finish
    const timeout = setTimeout(() => finish("played"), MAX_CLIP_MS)
    audio.onended = () => finish("played")
    audio.onerror = () => finish("failed")
    audio.play().catch(() => finish("failed"))
  })
}

export function stopClip(): void {
  finishCurrent?.("stopped")
  element?.pause()
}

function unlock(): void {
  // A prompt started by this tap unlocks the element by itself.
  if (finishCurrent) return stopListening()
  const audio = player()
  audio.muted = true
  audio.src = SILENCE_URL
  audio.play().then(
    () => {
      if (!finishCurrent) audio.pause()
      stopListening()
    },
    () => {}
  )
  if ("speechSynthesis" in window)
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""))
}

const GESTURES = ["touchend", "click", "keydown"] as const

function stopListening(): void {
  for (const type of GESTURES) window.removeEventListener(type, unlock, true)
}

if (typeof window !== "undefined")
  for (const type of GESTURES) window.addEventListener(type, unlock, true)
