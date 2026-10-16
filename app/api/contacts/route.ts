/*
 * GET /api/contacts: contacts in alert order, with invite links, email status
 * and whether email alerts are configured. POST /api/contacts: adds a contact
 * ({ name, priority }). Chat IDs are never returned and
 * email addresses are masked.
 */
import { z } from "zod"

import { publicView } from "@/lib/server/contact-view"
import {
  confirmedEmails,
  emailAlertsConfigured,
} from "@/lib/server/email-alert"
import { getStore } from "@/lib/server/providers/store"

const NewContactSchema = z.object({
  name: z.string().trim().min(1).max(60),
  priority: z.number().int().min(1).max(20),
})

export async function GET() {
  const contacts = await (await getStore()).listContacts()
  const confirmed = contacts.some((contact) => contact.email)
    ? await confirmedEmails()
    : null
  return Response.json(
    {
      contacts: contacts.map((contact) => publicView(contact, confirmed)),
      emailAlerts: emailAlertsConfigured(),
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}

export async function POST(request: Request) {
  const body = NewContactSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!body.success)
    return Response.json(
      { error: "Expected { name, priority }." },
      { status: 400 }
    )
  const contact = await (await getStore()).addContact(body.data)
  return Response.json({ contact: publicView(contact) }, { status: 201 })
}
