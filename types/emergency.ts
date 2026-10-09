export type EmergencyEvent = {
  id: string
  type: string
  message: string
  occurredAt: string
  location?: string
}

export type NotificationResult = {
  status: "published" | "failed"
  eventId: string
  contactCount: number
  messageId?: string
  reason?: string
}
