import type { LucideIcon } from "lucide-react"

export type ChatMessage = {
  id: number
  role: "user" | "alexa"
  text: string
}

export type Suggestion = {
  icon: LucideIcon
  label: string
}

export type AlexaDevice = {
  icon: LucideIcon
  name: string
  room: string
  detail: string
  tone: "cyan" | "amber" | "blue"
}