import "server-only"

import { sendEmergencyAlert } from "@/lib/aws/sns"
import { getStore } from "@/lib/server/providers/store"
import type { EmergencyEvent, NotificationResult } from "@/types/emergency"

export async function notifyEmergency(
  event: EmergencyEvent
): Promise<NotificationResult> {
  // Email contacts are stored with the other contacts in the configured store.
  const contacts = (await (await getStore()).listContacts()).filter(
    (contact) => contact.email
  )
  // Local status is informational: SNS handles confirmation and delivery.
  try {
    const messageId = await sendEmergencyAlert(event)
    return {
      status: "published",
      eventId: event.id,
      contactCount: contacts.length,
      messageId,
    }
  } catch (error) {
    console.error("Emergency SNS publish failed", error)
    return {
      status: "failed",
      eventId: event.id,
      contactCount: contacts.length,
      reason: "Emergency alert could not be published",
    }
  }
}
