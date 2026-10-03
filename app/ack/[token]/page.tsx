/*
 * /ack/[token]: the page a contact opens from an alert. It shows what happened
 * and has an "I'm handling it" button.
 *
 * Why this file exists: contacts need one tap to stop the escalation and let
 * the others know. Opening the page changes nothing (link previews open it
 * too); only the button does, via POST /api/ack.
 */
import type { Metadata } from "next"

import { Button } from "@/components/ui/button"
import { getIncident } from "@/lib/safety/incidents"
import { EMERGENCY_NUMBERS } from "@/lib/safety/region"
import { verifyAckToken } from "@/lib/server/ack-token"
import { requireEnv } from "@/lib/server/env"
import { getStore } from "@/lib/server/providers/store"

export const metadata: Metadata = {
  title: "Safety alert",
  robots: { index: false },
}

export default async function AckPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ done?: string }>
}) {
  const { token } = await params
  const { done } = await searchParams
  const claims = claimsFromToken(token)
  const store = await getStore()
  const incident = claims ? await store.getIncident(claims.incidentId) : null

  if (!claims || !incident) {
    return (
      <Shell title="Link not valid">
        This link is invalid or has expired. If you are worried, call them now
        or call {EMERGENCY_NUMBERS.unified}.
      </Shell>
    )
  }

  const contacts = await store.listContacts()
  const nameOf = (id: string | null) =>
    contacts.find((contact) => contact.id === id)?.name ?? "Someone"
  const { label } = getIncident(incident.incidentType)
  const quote = incident.classification?.supportingQuote

  return (
    <Shell title={label}>
      <dl className="m-0 grid gap-1 text-sm">
        <Row term="Heard">{incident.triggerDescription}</Row>
        {quote && <Row term="Said">“{quote}”</Row>}
        <Row term="When">
          {new Date(incident.createdAtMs).toLocaleString("en-GB", {
            timeZone: "Asia/Riyadh",
          })}
        </Row>
      </dl>

      {incident.status === "acknowledged" ? (
        <p className="m-0 rounded-md bg-[#15301f] p-3 text-[#b9ecc8]">
          {incident.acknowledgedByContactId === claims.contactId
            ? "Thank you, you are handling this."
            : `${nameOf(incident.acknowledgedByContactId)} is handling this.`}
          {done ? " The others have been told." : ""}
        </p>
      ) : incident.status === "cancelled" ? (
        <p className="m-0 rounded-md bg-[#15301f] p-3 text-[#b9ecc8]">
          They said they are fine. No action needed.
        </p>
      ) : (
        <form action="/api/ack" method="post" className="grid gap-2">
          <input type="hidden" name="token" value={token} />
          <Button
            className="h-12 bg-[#00c8f4] text-base font-semibold text-[#06131c] hover:bg-[#59ddf5]"
            type="submit"
          >
            I&apos;m handling it / سأتولى الأمر
          </Button>
          <p className="m-0 text-xs text-[#a7adb2]">
            This stops the alerts to the other contacts.
          </p>
        </form>
      )}

      <p className="m-0 text-sm text-[#e2b78e]">
        Emergency: call {EMERGENCY_NUMBERS.unified} (ambulance{" "}
        {EMERGENCY_NUMBERS.ambulance}, civil defence{" "}
        {EMERGENCY_NUMBERS.civilDefence}).
      </p>
    </Shell>
  )
}

/** Checks the signature and expiry. Reading the page never acknowledges anything. */
function claimsFromToken(token: string) {
  return verifyAckToken(token, requireEnv("ACK_TOKEN_SECRET"), Date.now())
}

function Shell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <main className="min-h-dvh bg-[#0b1421] px-4 py-10 text-[#f3f6fa]">
      <div className="mx-auto grid max-w-md gap-4 rounded-[12px] border border-[#263d54] bg-[#0e1b2a] p-5">
        <h1 className="m-0 text-xl font-semibold">🚨 {title}</h1>
        {children}
      </div>
    </main>
  )
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-[#858b92]">{term}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  )
}
