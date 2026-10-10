/*
 * POST /api/ack: a contact answers an incident from the /ack/[token] page:
 * "on-my-way", "calling" or "handling" (the form's `response` field).
 *
 * Why this file exists: acknowledging stops escalation, so it happens only on
 * an explicit button press (POST), never when a link is merely opened. Chat
 * apps and email open links on their own to build previews. The signed token
 * says which contact acknowledged; an email link (one per incident, sent to
 * everyone) instead takes the contact chosen on the page (`contact`).
 */
import { ANY_CONTACT, verifyAckToken } from "@/lib/server/ack-token"
import { escalationDeps } from "@/lib/server/escalation-deps"
import { acknowledgeIncident } from "@/lib/server/escalation-runner"
import { CONTACT_RESPONSES, type ContactResponse } from "@/lib/safety/types"

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const token = form?.get("token")
  if (typeof token !== "string")
    return Response.json({ error: "Missing token." }, { status: 400 })

  const deps = await escalationDeps()
  const claims = verifyAckToken(token, deps.ackSecret, deps.nowMs)
  if (!claims)
    return Response.json(
      { error: "This link is invalid or has expired." },
      { status: 400 }
    )

  const chosen = form?.get("contact")
  const contactId =
    claims.contactId === ANY_CONTACT
      ? typeof chosen === "string"
        ? chosen
        : ""
      : claims.contactId
  if (!contactId)
    return Response.json({ error: "Choose who you are." }, { status: 400 })

  const requested = form?.get("response")
  const response = CONTACT_RESPONSES.find((value) => value === requested)
  await acknowledgeIncident(
    deps,
    { incidentId: claims.incidentId, contactId },
    (response ?? "handling") satisfies ContactResponse
  )
  const done = new URL(`/ack/${token}`, request.url)
  done.searchParams.set("done", "1")
  if (claims.contactId === ANY_CONTACT) done.searchParams.set("as", contactId)
  return Response.redirect(done, 303)
}
