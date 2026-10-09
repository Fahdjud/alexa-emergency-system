/*
 * PUT /api/contacts/[id]/email: saves a contact's email address ({ email })
 * and signs it up to the AWS SNS topic, so alerts are emailed to them too.
 *
 * Why this file exists: the first email layer kept contacts in a JSON file,
 * which cannot be written on Vercel (read-only file system, and every request
 * may run on a different server), so adding a contact failed in production.
 * Emails now live on the same contact records as Telegram, in the configured
 * store (Supabase in production). Device-token protected, like every other
 * contacts route, so strangers cannot sign addresses up to the topic.
 */
import { z } from "zod"

import { rejectUnlessDevice } from "@/lib/server/device-token"
import { publicView } from "@/lib/server/contact-view"
import { emailAlertsConfigured, signUpForEmail } from "@/lib/server/email-alert"
import { getStore } from "@/lib/server/providers/store"

const EmailSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
})

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rejection = rejectUnlessDevice(request)
  if (rejection) return rejection
  if (!emailAlertsConfigured())
    return Response.json(
      {
        error:
          "Email alerts are not set up on this deployment yet (AWS settings missing).",
      },
      { status: 503 }
    )

  const body = EmailSchema.safeParse(await request.json().catch(() => null))
  if (!body.success)
    return Response.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    )

  const { id } = await params
  const store = await getStore()
  if (!(await store.listContacts()).some((contact) => contact.id === id))
    return Response.json({ error: "Unknown contact." }, { status: 404 })

  const status = await signUpForEmail(body.data.email)
  const contact = await store.setContactEmail(id, body.data.email, status)
  if (!contact)
    return Response.json({ error: "Unknown contact." }, { status: 404 })
  return Response.json(
    { contact: publicView(contact) },
    { status: status === "failed" ? 502 : 200 }
  )
}
