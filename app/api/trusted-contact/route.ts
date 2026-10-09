import { subscribeTrustedContact } from "@/lib/aws/sns"
import {
  saveTrustedContact,
  updateSubscriptionInfo,
} from "@/lib/trusted-contacts"

export const runtime = "nodejs"

export async function POST(request: Request) {
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
    ![body.name, body.email, body.relationship].every(
      (value) =>
        typeof value === "string" &&
        value.trim().length > 0 &&
        value.length <= 254
    ) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
    (body.id !== undefined &&
      (typeof body.id !== "string" || !body.id.trim() || body.id.length > 100))
  ) {
    return Response.json(
      {
        error:
          "Provide name, valid email, relationship, and optionally an existing contact id",
      },
      { status: 400 }
    )
  }
  try {
    const contact = await saveTrustedContact({
      id: body.id,
      name: body.name,
      email: body.email,
      relationship: body.relationship,
    })
    try {
      const info = await subscribeTrustedContact(contact.email)
      const updated = await updateSubscriptionInfo(
        contact.id,
        info,
        contact.email
      )
      return Response.json({ contact: updated })
    } catch (error) {
      console.error("Trusted contact subscription failed", error)
      const updated = await updateSubscriptionInfo(
        contact.id,
        { subscriptionStatus: "failed", subscriptionArn: null },
        contact.email
      )
      return Response.json(
        {
          contact: updated,
          error:
            "Contact saved, but SNS subscription could not be completed. Retry this request.",
        },
        { status: 502 }
      )
    }
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "Contact ID not found",
        "Email already belongs to another contact",
      ].includes(error.message)
    ) {
      return Response.json(
        { error: error.message },
        { status: error.message === "Contact ID not found" ? 404 : 409 }
      )
    }
    console.error("Trusted contact persistence failed", error)
    return Response.json(
      { error: "Unable to save trusted contact" },
      { status: 500 }
    )
  }
}
