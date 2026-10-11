/*
 * GET /api/incidents/[id]: the incident's status and who answered, so the
 * monitor can say "Sara is on the way" or tell the person to call for help.
 */
import { rejectUnlessDevice } from "@/lib/server/device-token"
import { getStore } from "@/lib/server/providers/store"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rejection = rejectUnlessDevice(request)
  if (rejection) return rejection

  const { id } = await params
  const store = await getStore()
  const incident = await store.getIncident(id)
  if (!incident)
    return Response.json({ error: "Unknown incident." }, { status: 404 })

  const acknowledgedBy = incident.acknowledgedByContactId
    ? ((await store.listContacts()).find(
        (contact) => contact.id === incident.acknowledgedByContactId
      )?.name ?? null)
    : null
  return Response.json(
    {
      status: incident.status,
      acknowledgedBy,
      response: incident.acknowledgedResponse,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
