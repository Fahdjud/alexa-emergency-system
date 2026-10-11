// Voice ranking: language first, then natural/neural voices over compact ones.
import { describe, expect, it } from "vitest"

import { bestVoice } from "./voice-choice"

const voice = (name: string, lang: string) => ({
  name,
  lang,
  localService: true,
})

describe("bestVoice", () => {
  it("prefers a natural Saudi voice", () => {
    const voices = [
      voice("Microsoft Naayf - Arabic (Saudi Arabia)", "ar-SA"),
      voice(
        "Microsoft Hamed Online (Natural) - Arabic (Saudi Arabia)",
        "ar-SA"
      ),
      voice("Microsoft Shakir Online (Natural) - Arabic (Egypt)", "ar-EG"),
      voice("Google US English", "en-US"),
    ]
    expect(bestVoice(voices, "ar-SA")?.name).toContain("Hamed")
  })

  it("falls back to another variant of the language", () => {
    const voices = [voice("Maged", "ar_EG"), voice("Samantha", "en-US")]
    expect(bestVoice(voices, "ar-SA")?.name).toBe("Maged")
  })

  it("avoids compact voices and other languages", () => {
    const voices = [
      voice("Samantha (Compact)", "en-US"),
      voice("Google US English", "en-US"),
      voice("Google العربية", "ar-SA"),
    ]
    expect(bestVoice(voices, "en-US")?.name).toBe("Google US English")
    expect(bestVoice([voice("Thomas", "fr-FR")], "ar-SA")).toBeUndefined()
  })
})
