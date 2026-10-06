import "server-only"

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import type { TrustedContact, TrustedContactInput } from "@/types/emergency"

const filePath = path.join(process.cwd(), "data", "trusted-contacts.json")
let writes: Promise<unknown> = Promise.resolve()

async function readContacts(): Promise<TrustedContact[]> {
  let contents: string
  try {
    contents = await readFile(filePath, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  const contacts: unknown = JSON.parse(contents)
  const statuses = [
    "not_subscribed",
    "pending_confirmation",
    "confirmed",
    "failed",
  ]
  if (
    !Array.isArray(contacts) ||
    !contacts.every(
      (contact) =>
        contact &&
        typeof contact === "object" &&
        [contact.id, contact.name, contact.email, contact.relationship].every(
          (value) => typeof value === "string"
        ) &&
        statuses.includes(contact.subscriptionStatus) &&
        (contact.subscriptionArn === null ||
          typeof contact.subscriptionArn === "string")
    )
  )
    throw new Error("Invalid trusted contacts JSON; refusing to overwrite it")
  return contacts as TrustedContact[]
}

function mutate<T>(change: (contacts: TrustedContact[]) => T): Promise<T> {
  const operation = writes.then(async () => {
    const contacts = await readContacts()
    const result = change(contacts)
    await mkdir(path.dirname(filePath), { recursive: true })
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`
    await writeFile(
      temporaryPath,
      `${JSON.stringify(contacts, null, 2)}\n`,
      "utf8"
    )
    await rename(temporaryPath, filePath)
    return result
  })
  writes = operation.catch(() => undefined)
  return operation
}

export async function getTrustedContacts() {
  await writes
  return readContacts()
}

export async function getTrustedContact(id: string) {
  return (await getTrustedContacts()).find((contact) => contact.id === id)
}

export function saveTrustedContact(input: TrustedContactInput) {
  return mutate((contacts) => {
    const email = input.email.trim().toLowerCase()
    const existing = input.id
      ? contacts.find((contact) => contact.id === input.id)
      : contacts.find((contact) => contact.email === email)
    if (input.id && !existing) throw new Error("Contact ID not found")
    if (
      contacts.some(
        (contact) => contact.email === email && contact.id !== existing?.id
      )
    ) {
      throw new Error("Email already belongs to another contact")
    }
    const contact: TrustedContact = {
      id: existing?.id ?? randomUUID(),
      name: input.name.trim(),
      email,
      relationship: input.relationship.trim(),
      subscriptionStatus:
        existing?.email === email
          ? existing.subscriptionStatus
          : "not_subscribed",
      subscriptionArn:
        existing?.email === email ? existing.subscriptionArn : null,
    }
    if (existing) contacts[contacts.indexOf(existing)] = contact
    else contacts.push(contact)
    return contact
  })
}

export function updateSubscriptionInfo(
  id: string,
  info: Pick<TrustedContact, "subscriptionStatus" | "subscriptionArn">,
  expectedEmail?: string
) {
  return mutate((contacts) => {
    const contact = contacts.find((item) => item.id === id)
    if (!contact) throw new Error("Contact ID not found")
    // Do not attach an in-flight subscription result to a changed email.
    if (expectedEmail && contact.email !== expectedEmail) return contact
    Object.assign(contact, info)
    return contact
  })
}
