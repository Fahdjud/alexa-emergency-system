import "server-only"

import {
  ListSubscriptionsByTopicCommand,
  PublishCommand,
  SNSClient,
  SubscribeCommand,
} from "@aws-sdk/client-sns"
import { getAwsEnv } from "@/lib/env"
import type { EmergencyEvent } from "@/types/emergency"

let client: SNSClient | undefined
function getClient() {
  const { region } = getAwsEnv()
  return (client ??= new SNSClient({ region }))
}

export async function subscribeTrustedContact(email: string) {
  const { topicArn } = getAwsEnv()
  const response = await getClient().send(
    new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: "email",
      Endpoint: email,
      ReturnSubscriptionArn: true,
    })
  )
  return {
    subscriptionStatus: "pending_confirmation" as const,
    subscriptionArn:
      response.SubscriptionArn &&
      response.SubscriptionArn !== "pending confirmation"
        ? response.SubscriptionArn
        : null,
  }
}

export async function sendEmergencyAlert(event: EmergencyEvent) {
  const { topicArn } = getAwsEnv()
  const response = await getClient().send(
    new PublishCommand({
      TopicArn: topicArn,
      Subject: "Possible emergency detected — Alexa hackathon prototype",
      Message: [
        "A possible emergency was detected by the Alexa hackathon prototype.",
        "This automated alert is not a confirmed medical diagnosis. Please check on the person.",
        "",
        `Event ID: ${event.id}`,
        `Detection type: ${event.type}`,
        `Detected at: ${event.occurredAt}`,
        ...(event.location ? [`Reported location: ${event.location}`] : []),
        `Reported details: ${event.message}`,
      ].join("\n"),
    })
  )
  if (!response.MessageId) throw new Error("SNS did not return a message ID")
  return response.MessageId
}

/** Publishes a ready-made email to the topic (used by the safety monitor's escalation). */
export async function publishEmail({
  subject,
  message,
}: {
  subject: string
  message: string
}) {
  const { topicArn } = getAwsEnv()
  const response = await getClient().send(
    new PublishCommand({
      TopicArn: topicArn,
      Subject: subject,
      Message: message,
    })
  )
  if (!response.MessageId) throw new Error("SNS did not return a message ID")
  return response.MessageId
}

/** Every email address that has confirmed its subscription to the topic (lowercase). */
export async function confirmedEmailSubscribers(): Promise<Set<string>> {
  const { topicArn } = getAwsEnv()
  const confirmed = new Set<string>()
  let nextToken: string | undefined
  do {
    const page = await getClient().send(
      new ListSubscriptionsByTopicCommand({
        TopicArn: topicArn,
        NextToken: nextToken,
      })
    )
    for (const subscription of page.Subscriptions ?? []) {
      // Pending ones read "PendingConfirmation" instead of an ARN.
      if (
        subscription.Protocol === "email" &&
        subscription.Endpoint &&
        subscription.SubscriptionArn?.startsWith("arn:")
      )
        confirmed.add(subscription.Endpoint.toLowerCase())
    }
    nextToken = page.NextToken
  } while (nextToken)
  return confirmed
}
