/*
 * safety-api.ts: the monitor page's calls to the escalation API (report an
 * incident, send the answer, read its status, manage contacts).
 *
 * Why this file exists: keeps fetch details, the device token header and
 * error handling out of the React hook. Every call returns null (or false) on
 * failure instead of throwing, because the monitor must keep working when
 * the network does not.
 */
import { encodeWav } from "@/lib/audio/wav"
import type { Classification } from "@/lib/safety/schemas"
import type {
  ContactResponse,
  Language,
  TriggerMatch,
} from "@/lib/safety/types"

const TIMEOUT_MS = 15_000

export type IncidentReport = {
  trigger: TriggerMatch
  language: Language
  secondsLeft: number
  snippet: { samples: Float32Array; sampleRate: number } | null
  transcript: string | null
  classification: Classification | null
}

export type IncidentStatusView = {
  status: string
  acknowledgedBy: string | null
  /** How the contact answered; null for older records. */
  response: ContactResponse | null
}

export type ContactView = {
  id: string
  name: string
  priority: number
  /** Can be alerted on some channel: Telegram, or a confirmed email. */
  connected: boolean
  telegramConnected: boolean
  inviteLink: string | null
  email: string | null
  /**
   * "confirmed": they clicked AWS's link and get email alerts. "pending": AWS
   * emailed them that link. "failed": sign-up failed; save again to retry.
   */
  emailStatus: "pending" | "confirmed" | "failed" | null
}

export type ContactList = {
  contacts: ContactView[]
  /** Whether this deployment can email alerts (AWS settings present). */
  emailAlerts: boolean
}

/** Records the incident on the server. Returns its id. */
export async function reportIncident(
  report: IncidentReport,
  deviceToken: string
): Promise<string | null> {
  const form = new FormData()
  form.append("trigger", JSON.stringify(report.trigger))
  form.append("language", report.language)
  form.append(
    "secondsLeft",
    String(Math.max(0, Math.round(report.secondsLeft)))
  )
  if (report.transcript) form.append("transcript", report.transcript)
  if (report.classification)
    form.append("classification", JSON.stringify(report.classification))
  if (report.snippet) {
    form.append(
      "audio",
      new Blob([encodeWav(report.snippet.samples, report.snippet.sampleRate)], {
        type: "audio/wav",
      }),
      "snippet.wav"
    )
  }
  const body = await call<{ id: string }>("/api/incidents", deviceToken, {
    method: "POST",
    body: form,
  })
  return body?.id ?? null
}

export async function sendAnswer(
  incidentId: string,
  answer: "fine" | "help" | "no-answer",
  deviceToken: string
): Promise<boolean> {
  const body = await call<{ accepted: boolean }>(
    `/api/incidents/${incidentId}/response`,
    deviceToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    }
  )
  return body?.accepted === true
}

export function getIncidentStatus(
  incidentId: string,
  deviceToken: string
): Promise<IncidentStatusView | null> {
  return call<IncidentStatusView>(`/api/incidents/${incidentId}`, deviceToken)
}

export function loadContacts(deviceToken: string): Promise<ContactList | null> {
  return call<ContactList>("/api/contacts", deviceToken)
}

export async function listContacts(
  deviceToken: string
): Promise<ContactView[] | null> {
  return (await loadContacts(deviceToken))?.contacts ?? null
}

/** Saves a contact's email and signs it up for email alerts. Returns the error to show, if any. */
export async function saveContactEmail(
  contactId: string,
  email: string,
  deviceToken: string
): Promise<{ contact: ContactView | null; error: string | null }> {
  try {
    const response = await fetch(`/api/contacts/${contactId}/email`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deviceToken}`,
      },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = (await response.json().catch(() => ({}))) as {
      contact?: ContactView
      error?: string
    }
    if (body.contact)
      return {
        contact: body.contact,
        error: response.ok
          ? null
          : "Saved, but AWS did not accept the address. Try again.",
      }
    return { contact: null, error: body.error ?? "Could not save the email." }
  } catch {
    return { contact: null, error: "Could not reach the server." }
  }
}

export async function addContact(
  name: string,
  priority: number,
  deviceToken: string
): Promise<ContactView | null> {
  const body = await call<{ contact: ContactView }>(
    "/api/contacts",
    deviceToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, priority }),
    }
  )
  return body?.contact ?? null
}

export async function sendHeartbeat(
  listening: boolean,
  deviceToken: string
): Promise<boolean> {
  const body = await call<{ ok: boolean }>("/api/heartbeat", deviceToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listening }),
  })
  return body?.ok === true
}

export type TestAlertSent = { id: string; sentTo: string[]; emailed: boolean }

/** Sends the practice alert (marked TEST) to every contact. */
export async function sendTestAlert(
  language: Language,
  deviceToken: string
): Promise<TestAlertSent | { error: string }> {
  try {
    const response = await fetch("/api/test-alert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deviceToken}`,
      },
      body: JSON.stringify({ language }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = (await response.json().catch(() => ({}))) as
      TestAlertSent | { error?: string }
    if (response.ok && "id" in body) return body
    return {
      error:
        ("error" in body && body.error) || "The test alert could not be sent.",
    }
  } catch {
    return { error: "Could not reach the server." }
  }
}

/** Checks a device token against the server before it is saved. */
export async function verifyDeviceToken(
  deviceToken: string
): Promise<"ok" | "wrong" | "unreachable"> {
  try {
    const response = await fetch("/api/health/config", {
      headers: { Authorization: `Bearer ${deviceToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.ok) return "ok"
    return response.status === 401 ? "wrong" : "unreachable"
  } catch {
    return "unreachable"
  }
}

async function call<T>(
  url: string,
  deviceToken: string,
  init: RequestInit = {}
): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${deviceToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}
