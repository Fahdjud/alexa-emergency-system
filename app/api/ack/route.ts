/*
 * POST /api/ack: a contact confirms they are handling an incident (the button
 * on the /ack/[token] page).
 *
 * Why this file exists: acknowledging stops escalation, so it happens only on
 * an explicit button press (POST), never when a link is merely opened. Chat
 * apps and email open links on their own to build previews. The signed token
 * says which contact acknowledged.
 */
import { verifyAckToken } from "@/lib/server/ack-token"
import { escalationDeps } from "@/lib/server/escalation-deps"
import { acknowledgeIncident } from "@/lib/server/escalation-runner"

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

  await acknowledgeIncident(deps, claims)
  return Response.redirect(new URL(`/ack/${token}?done=1`, request.url), 303)
}
