/*
 * GET /api/incidents/[id]: the incident's current status, for the monitor
 * page to show "Sara is handling it" or "Nobody answered, call 911".
 *
 * Why this file exists: escalation runs on the server, so the monitor has to
 * ask how it is going. Returns only what the screen needs. Device-token
 * protected.
 */
import { rejectUnlessDevice } from "@/lib/server/device-token"
import { getStore } from "@/lib/server/providers/store"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejection = rejectUnlessDevice(request)
  if (rejection) return rejection

  const { id } = await params
  const store = await getStore()
  const incident = await store.getIncident(id)
  if (!incident) return Response.json({ error: "Unknown incident." }, { status: 404 })

  const acknowledgedBy = incident.acknowledgedByContactId
    ? ((await store.listContacts()).find((contact) => contact.id === incident.acknowledgedByContactId)?.name ?? null)
    : null
  return Response.json({ status: incident.status, acknowledgedBy }, { headers: { "Cache-Control": "no-store" } })
}
