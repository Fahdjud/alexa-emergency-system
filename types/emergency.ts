export type SubscriptionStatus =
  "not_subscribed" | "pending_confirmation" | "confirmed" | "failed"

export type TrustedContact = {
  id: string
  name: string
  email: string
  relationship: string
  subscriptionStatus: SubscriptionStatus
  subscriptionArn: string | null
}

export type TrustedContactInput = Pick<
  TrustedContact,
  "name" | "email" | "relationship"
> & {
  id?: string
}

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
