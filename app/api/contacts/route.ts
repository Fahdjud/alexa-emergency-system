/*
 * GET /api/contacts: the emergency contacts, in alert order, with their
 * Telegram invite links. POST /api/contacts: adds one ({ name, priority }).
 *
 * Why this file exists: escalation needs people to alert, and each person
 * must open their invite link once to connect Telegram. This is the minimal
 * way to manage that from the monitor page; teammates can build a nicer UI on
 * it. Device-token protected. Chat IDs are never returned.
 */
import { z } from "zod"

import { rejectUnlessDevice } from "@/lib/server/device-token"
import { getStore, type ContactRecord } from "@/lib/server/providers/store"

const NewContactSchema = z.object({ name: z.string().trim().min(1).max(60), priority: z.number().int().min(1).max(20) })

export async function GET(request: Request) {
  const rejection = rejectUnlessDevice(request)
  if (rejection) return rejection
  const contacts = await (await getStore()).listContacts()
  return Response.json({ contacts: contacts.map(publicView) }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const rejection = rejectUnlessDevice(request)
  if (rejection) return rejection
  const body = NewContactSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return Response.json({ error: "Expected { name, priority }." }, { status: 400 })
  const contact = await (await getStore()).addContact(body.data)
  return Response.json({ contact: publicView(contact) }, { status: 201 })
}

function publicView(contact: ContactRecord) {
  const bot = process.env.TELEGRAM_BOT_USERNAME
  return {
    id: contact.id,
    name: contact.name,
    priority: contact.priority,
    connected: contact.telegramChatId !== null,
    inviteLink: bot ? `https://t.me/${bot}?start=${contact.inviteCode}` : null,
  }
}
