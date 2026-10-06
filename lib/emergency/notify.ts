import "server-only"

import { sendEmergencyAlert } from "@/lib/aws/sns"
import { getTrustedContacts } from "@/lib/trusted-contacts"
import type { EmergencyEvent, NotificationResult } from "@/types/emergency"

export async function notifyEmergency(
  event: EmergencyEvent
): Promise<NotificationResult> {
  const contacts = await getTrustedContacts()
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
