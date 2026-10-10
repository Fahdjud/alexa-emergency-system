/*
 * /ack/[token]: the page a contact opens from an alert. It shows what happened
 * and lets them answer: on my way, calling now, or handling it. A link from
 * an email (one per incident, sent to every contact) first asks who is
 * answering.
 *
 * Why this file exists: contacts need one tap to stop the escalation and let
 * the others know. Opening the page changes nothing (link previews open it
 * too); only the button does, via POST /api/ack.
 */
import type { Metadata } from "next"

import { Button } from "@/components/ui/button"
import { getIncident } from "@/lib/safety/incidents"
import { EMERGENCY_NUMBERS } from "@/lib/safety/region"
import { ANY_CONTACT, verifyAckToken } from "@/lib/server/ack-token"
import { RESPONSE_BUTTONS } from "@/lib/server/alert-message"
import { requireEnv } from "@/lib/server/env"
import { getStore } from "@/lib/server/providers/store"
import { isTestIncident } from "@/lib/server/test-incident"
import type { ContactResponse } from "@/lib/safety/types"

export const metadata: Metadata = {
  title: "Safety alert",
  robots: { index: false },
}

export default async function AckPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ done?: string; as?: string }>
}) {
  const { token } = await params
  const { done, as } = await searchParams
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
  const fromEmail = claims.contactId === ANY_CONTACT
  /** Who is answering: from the link, or (email) as chosen on this page. */
  const me = fromEmail
    ? (contacts.find((contact) => contact.id === as)?.id ?? null)
    : claims.contactId
  const test = isTestIncident(incident)
  const label = test
    ? "Test alert: nobody needs help"
    : getIncident(incident.incidentType).label
  const quote = incident.classification?.supportingQuote

  return (
    <Shell title={label} icon={test ? "🧪" : "🚨"}>
      <dl className="m-0 grid gap-1 text-sm">
        <Row term="Heard">{incident.triggerDescription}</Row>
        {quote && <Row term="Said">“{quote}”</Row>}
        <Row term="When">
          {new Date(incident.createdAtMs).toLocaleString("en-GB", {
            timeZone: "Asia/Riyadh",
          })}
        </Row>
      </dl>

      {incident.status === "acknowledged" &&
      incident.acknowledgedByContactId !== me &&
      !fromEmail ? (
        <p className="m-0 rounded-md bg-[#15301f] p-3 text-[#b9ecc8]">
          {nameOf(incident.acknowledgedByContactId)} is{" "}
          {responsePhrase(incident.acknowledgedResponse)}.
        </p>
      ) : incident.status === "cancelled" ? (
        <p className="m-0 rounded-md bg-[#15301f] p-3 text-[#b9ecc8]">
          They said they are fine. No action needed.
        </p>
      ) : (
        <form action="/api/ack" method="post" className="grid gap-2">
          <input type="hidden" name="token" value={token} />
          {incident.status === "acknowledged" &&
            (incident.acknowledgedByContactId === me ? (
              <p className="m-0 rounded-md bg-[#15301f] p-3 text-[#b9ecc8]">
                Thank you: they know you are{" "}
                {responsePhrase(incident.acknowledgedResponse)}.
                {done ? " The others have been told." : ""} You can change your
                answer below.
              </p>
            ) : (
              <p className="m-0 rounded-md bg-[#15301f] p-3 text-[#b9ecc8]">
                {nameOf(incident.acknowledgedByContactId)} is{" "}
                {responsePhrase(incident.acknowledgedResponse)}.
              </p>
            ))}
          {fromEmail && (
            <fieldset className="m-0 grid gap-1.5 rounded-md border border-[#263c53] p-3">
              <legend className="px-1 text-sm text-[#d4e0ec]">
                Who are you? / من أنت؟
              </legend>
              {contacts.map((contact) => (
                <label
                  className="flex items-center gap-2 text-sm"
                  key={contact.id}
                >
                  <input
                    type="radio"
                    name="contact"
                    value={contact.id}
                    defaultChecked={contact.id === me}
                    required
                  />
                  {contact.name}
                </label>
              ))}
            </fieldset>
          )}
          {(["on-my-way", "calling", "handling"] as const).map((response) => (
            <Button
              className={
                incident.status === "acknowledged" &&
                incident.acknowledgedByContactId === me &&
                incident.acknowledgedResponse === response
                  ? "h-12 bg-[#00c8f4] text-base font-semibold text-[#06131c] hover:bg-[#59ddf5]"
                  : "h-12 border border-[#263c53] bg-[#101e2d] text-base font-semibold text-[#d4e0ec] hover:bg-[#14283b]"
              }
              key={response}
              name="response"
              value={response}
              type="submit"
            >
              {RESPONSE_BUTTONS[response]}
            </Button>
          ))}
          <p className="m-0 text-xs text-[#a7adb2]">
            Answering stops the alerts to the other contacts, and the monitor
            tells them at home.
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

function responsePhrase(response: ContactResponse | null): string {
  if (response === "on-my-way") return "on the way"
  if (response === "calling") return "calling them"
  return "handling it"
}

/** Checks the signature and expiry. Reading the page never acknowledges anything. */
function claimsFromToken(token: string) {
  return verifyAckToken(token, requireEnv("ACK_TOKEN_SECRET"), Date.now())
}

function Shell({
  title,
  icon = "🚨",
  children,
}: {
  title: string
  icon?: string
  children: React.ReactNode
}) {
  return (
    <main className="min-h-dvh bg-[#0b1421] px-4 py-10 text-[#f3f6fa]">
      <div className="mx-auto grid max-w-md gap-4 rounded-[12px] border border-[#263d54] bg-[#0e1b2a] p-5">
        <h1 className="m-0 text-xl font-semibold">
          {icon} {title}
        </h1>
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
