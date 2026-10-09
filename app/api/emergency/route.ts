import { notifyEmergency } from "@/lib/emergency/notify"
import { rejectUnlessDevice } from "@/lib/server/device-token"

export const runtime = "nodejs"

export async function POST(request: Request) {
  // Only this household's devices may send alerts (same code as the monitor).
  const rejection = rejectUnlessDevice(request)
  if (rejection) return rejection
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    ![body.id, body.type, body.message, body.occurredAt].every(
      (value) => typeof value === "string" && value.trim().length > 0
    ) ||
    body.id.length > 100 ||
    body.type.length > 100 ||
    body.message.length > 10000 ||
    body.occurredAt.length > 100 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(body.occurredAt) ||
    !Number.isFinite(Date.parse(body.occurredAt)) ||
    (body.location !== undefined &&
      (typeof body.location !== "string" || body.location.length > 500))
  ) {
    return Response.json(
      {
        error:
          "Provide id, type, message, occurredAt (ISO date-time), and optionally location",
      },
      { status: 400 }
    )
  }
  try {
    const result = await notifyEmergency({
      id: body.id,
      type: body.type,
      message: body.message,
      occurredAt: body.occurredAt,
      location: body.location,
    })
    return Response.json(result, {
      status: result.status === "published" ? 200 : 502,
    })
  } catch (error) {
    console.error("Emergency notification failed", error)
    return Response.json(
      { error: "Unable to read emergency contacts" },
      { status: 500 }
    )
  }
}
