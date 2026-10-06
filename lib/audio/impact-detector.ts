/*
 * impact-detector.ts: spots a sudden loud impact (a body or object hitting
 * the floor) from the loudness of each 100 ms chunk of audio.
 *
 * Why this file exists: YAMNet rarely labels a real fall clearly, so falls
 * were missed. A fall is almost always a short, loud spike well above the
 * room's background level that dies away within a few hundred milliseconds
 * (music or a vacuum cleaner stays loud). This simple rule catches those
 * spikes. It is only used when the household sets falls to "High", because
 * doors and dropped objects make spikes too, and the "Are you okay?" question
 * sorts those out.
 */

export type ImpactDetectorOptions = {
  /** How many times louder than the recent background a spike must be. */
  ratio: number
  /** Minimum loudness (0-1, as from level.ts) so quiet rooms do not trigger on small sounds. */
  minLevel: number
  /** How quickly the background level follows the room (0-1 per chunk). */
  backgroundFollow: number
  /** The spike must fade to this share of its peak within `fadeWithinChunks`. */
  fadeTo: number
  fadeWithinChunks: number
  /** No second impact within this time (one fall makes several loud chunks). */
  cooldownMs: number
}

export const DEFAULT_IMPACT_OPTIONS: ImpactDetectorOptions = {
  ratio: 6,
  minLevel: 0.35,
  backgroundFollow: 0.05,
  fadeTo: 0.5,
  fadeWithinChunks: 2,
  cooldownMs: 5000,
}

/** Background never counts as quieter than this, so near-silence does not make every sound a spike. */
const BACKGROUND_FLOOR = 0.02

export class ImpactDetector {
  private background = BACKGROUND_FLOOR
  private lastImpactMs = -Infinity
  /** A spike waiting to see whether it fades (an impact) or stays loud (music). */
  private spike: { peak: number; chunksLeft: number } | null = null

  constructor(
    private readonly options: ImpactDetectorOptions = DEFAULT_IMPACT_OPTIONS
  ) {}

  /** Feeds one chunk's loudness. Returns the impact's peak loudness on the chunk that confirms it, else null. */
  push(level: number, timeMs: number): number | null {
    const { ratio, minLevel, backgroundFollow, fadeTo, fadeWithinChunks } =
      this.options
    let impact: number | null = null

    if (this.spike) {
      if (level <= this.spike.peak * fadeTo) {
        if (timeMs - this.lastImpactMs >= this.options.cooldownMs) {
          impact = this.spike.peak
          this.lastImpactMs = timeMs
        }
        this.spike = null
      } else {
        this.spike.peak = Math.max(this.spike.peak, level)
        this.spike.chunksLeft -= 1
        if (this.spike.chunksLeft <= 0) this.spike = null // stayed loud: not an impact
      }
    } else if (level >= minLevel && level >= this.background * ratio) {
      this.spike = { peak: level, chunksLeft: fadeWithinChunks }
    }

    this.background = Math.max(
      BACKGROUND_FLOOR,
      this.background + (level - this.background) * backgroundFollow
    )
    return impact
  }
}
