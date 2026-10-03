// Tests for understanding the answer to "Are you okay?".
import { describe, expect, it } from "vitest"

import { interpretReply } from "./confirmation"

describe("interpretReply", () => {
  it.each([
    "I'm fine",
    "I am okay, thanks",
    "yes",
    "No problem, false alarm",
    "never mind, don't call anyone",
    "أنا بخير",
    "تمام الحمد لله",
    "لا بأس",
    "نعم",
    "لا تتصل",
  ])("reads %j as fine", (reply) => {
    expect(interpretReply(reply)).toBe("fine")
  })

  it.each([
    "help",
    "no",
    "I'm not okay",
    "I'm not fine",
    "call my daughter",
    "it hurts",
    "ساعدني",
    "لا",
    "مو بخير",
    "اتصلوا بالإسعاف",
    "النَّجدة",
  ])("reads %j as help", (reply) => {
    expect(interpretReply(reply)).toBe("help")
  })

  it("chooses help when both are heard", () => {
    expect(interpretReply("I'm fine... no wait, help")).toBe("help")
    expect(interpretReply("No, I'm fine")).toBe("help") // ambiguous: safety wins
  })

  it.each(["", "what?", "the weather is nice", "مرحبا"])(
    "reads %j as unclear",
    (reply) => {
      expect(interpretReply(reply)).toBe("unclear")
    }
  )
})
