import { AirVent, AudioLines, Clock3, Lightbulb, Music2, Sun } from "lucide-react"

import type { AlexaDevice, Suggestion } from "./types"

export const suggestions: Suggestion[] = [
  { icon: Sun, label: "What should I know about today?" },
  { icon: Music2, label: "Make me a focus playlist" },
  { icon: Clock3, label: "Help me wind down tonight" },
]

export const devices: AlexaDevice[] = [
  { icon: AudioLines, name: "Echo Studio", room: "Living room", detail: "Playing nothing", tone: "cyan" },
  { icon: Lightbulb, name: "Ceiling lights", room: "Living room", detail: "Off", tone: "amber" },
  { icon: AirVent, name: "Thermostat", room: "Downstairs", detail: "72° · Auto", tone: "blue" },
]

export function getDemoReply(prompt: string) {
  const normalizedPrompt = prompt.toLowerCase()

  if (normalizedPrompt.includes("playlist") || normalizedPrompt.includes("music")) {
    return "A little focus sounds good. Imagine your favorite low-key playlist starting now. What are you working on?"
  }

  if (normalizedPrompt.includes("wind down") || normalizedPrompt.includes("tonight")) {
    return "Let’s make the evening feel easy: dim the lights, put on something calming, and give yourself a few quiet minutes."
  }

  if (normalizedPrompt.includes("today") || normalizedPrompt.includes("weather")) {
    return "I can help you plan the day. Take a look at your local forecast, then tell me what you have coming up and we’ll make a plan."
  }

  return "I’m here. This Alexa-inspired preview keeps replies on your device, so try asking for a playlist, a daily plan, or a calmer evening."
}