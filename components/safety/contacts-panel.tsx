"use client"

/*
 * Emergency contacts in alert order, with invite links, email addresses and
 * live connection status. While anyone is still waiting to connect, the list
 * refreshes itself.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Check, Mail, Share2, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  addContact,
  loadContacts,
  saveContactEmail,
  type ContactView,
} from "@/lib/client/safety-api"

const REFRESH_WHILE_WAITING_MS = 4000

export function ContactsPanel({
  onChange,
}: {
  /** Called with the latest list, e.g. so the setup screen knows if anyone is connected. */
  onChange?: (contacts: ContactView[]) => void
}) {
  const [contacts, setContacts] = useState<ContactView[] | null>(null)
  const [emailAlerts, setEmailAlerts] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [loadFailed, setLoadFailed] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const list = await loadContacts()
    setLoadFailed(!list)
    if (!list) return
    setContacts(list.contacts)
    setEmailAlerts(list.emailAlerts)
    onChange?.(list.contacts)
  }, [onChange])

  const waiting =
    contacts?.some(
      (contact) => !contact.connected || contact.emailStatus === "pending"
    ) ?? true
  useEffect(() => {
    const first = setTimeout(refresh, 0)
    if (!waiting) return () => clearTimeout(first)
    const timer = setInterval(refresh, REFRESH_WHILE_WAITING_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [refresh, waiting])

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const added = await addContact(name.trim(), (contacts?.length ?? 0) + 1)
    if (!added) return setError("Could not add the contact.")
    setName("")
    setEmail("")
    setError("")
    if (email.trim()) {
      const saved = await saveContactEmail(added.id, email.trim())
      if (saved.error)
        setError(`${added.name} was added. Email: ${saved.error}`)
    }
    await refresh()
  }

  async function saveEmail(contact: ContactView, address: string) {
    const saved = await saveContactEmail(contact.id, address)
    setError(saved.error ? `${contact.name}: ${saved.error}` : "")
    await refresh()
    return saved.error === null
  }

  async function share(contact: ContactView) {
    if (!contact.inviteLink) return
    const text = `You are an emergency contact for our home safety monitor. Open this link and tap Start: ${contact.inviteLink}`
    if (navigator.share) {
      await navigator.share({ text }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(contact.inviteLink)
    setCopiedId(contact.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      {contacts && contacts.length === 0 && (
        <p className="m-0 rounded-lg border border-dashed border-[#2a4057] p-4 text-center text-sm text-[#a7adb2]">
          No contacts yet. Add the people who should be alerted, in order.
        </p>
      )}

      <ol className="m-0 grid min-w-0 list-none grid-cols-1 gap-2 p-0">
        {contacts?.map((contact, index) => (
          <li
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-[#23354a] bg-[#0b1624] p-3"
            key={contact.id}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#16334a] text-sm font-semibold text-[#72def2]">
                {index + 1}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium text-[#e8eef5]">
                  {contact.name}
                </span>
                <span
                  className={`text-xs ${contact.connected ? "text-[#8fd0a6]" : "text-[#e2b78e]"}`}
                >
                  {reachableText(contact)}
                </span>
              </span>
              {!contact.telegramConnected && contact.inviteLink && (
                <Button
                  className="shrink-0 border-[#263c53] bg-[#101e2d] text-[#d4e0ec] hover:bg-[#14283b]"
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => share(contact)}
                >
                  {copiedId === contact.id ? (
                    <Check size={14} />
                  ) : (
                    <Share2 size={14} />
                  )}
                  {copiedId === contact.id
                    ? "Copied"
                    : contact.connected
                      ? "Add Telegram"
                      : "Send invite"}
                </Button>
              )}
            </div>
            {emailAlerts && (
              <EmailRow
                contact={contact}
                onSave={(address) => saveEmail(contact, address)}
              />
            )}
          </li>
        ))}
      </ol>

      <form className="flex flex-wrap gap-2" onSubmit={add}>
        <input
          className={inputClass}
          aria-label="Contact name"
          placeholder="Name, e.g. Sara (daughter)"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {emailAlerts && (
          <input
            className={inputClass}
            aria-label="Contact email (optional)"
            placeholder="Email (optional)"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
        <Button
          className="h-10 bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5]"
          type="submit"
          disabled={!name.trim()}
        >
          <UserPlus size={15} />
          Add
        </Button>
      </form>
      {(error || loadFailed) && (
        <p className="m-0 text-xs text-[#e2b78e]" role="status">
          {error || "Could not load contacts."}
        </p>
      )}
    </div>
  )
}

/** How this contact will be alerted, in a few words. */
function reachableText(contact: ContactView): string {
  const email = contact.emailStatus === "confirmed"
  if (contact.telegramConnected && email)
    return "Connected on Telegram and email"
  if (contact.telegramConnected) return "Connected on Telegram"
  if (email) return "Connected by email"
  if (contact.emailStatus === "pending")
    return "Waiting for them to confirm the email, or open the Telegram invite"
  return "Waiting for them to open the invite and tap Start"
}

const inputClass =
  "h-10 min-w-0 flex-1 basis-40 rounded-lg border border-[#263d54] bg-[#091523] px-3 text-sm outline-none focus:border-[#168aa4]"

/** The contact's email: its status, or a small form to add or fix it. */
function EmailRow({
  contact,
  onSave,
}: {
  contact: ContactView
  onSave: (address: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [address, setAddress] = useState("")
  const [saving, setSaving] = useState(false)

  if (editing)
    return (
      <form
        className="flex gap-2 pl-11"
        onSubmit={async (event) => {
          event.preventDefault()
          setSaving(true)
          if (await onSave(address.trim())) setEditing(false)
          setSaving(false)
        }}
      >
        <input
          className="h-8 min-w-0 flex-1 rounded-md border border-[#263d54] bg-[#091523] px-2 text-xs outline-none focus:border-[#168aa4]"
          aria-label={`Email for ${contact.name}`}
          placeholder="name@example.com"
          type="email"
          autoComplete="off"
          autoFocus
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <Button
          className="h-8 bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5]"
          size="sm"
          type="submit"
          disabled={saving || !address.trim()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </form>
    )

  return (
    <div className="grid min-w-0 grid-cols-1 gap-0.5 pl-11 text-xs text-[#a7adb2]">
      <div className="flex min-w-0 items-center gap-2">
        <Mail size={13} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {contact.email ?? "No email"}
        </span>
        <button
          className="shrink-0 text-[#72def2] underline-offset-2 hover:underline"
          type="button"
          onClick={() => setEditing(true)}
        >
          {contact.email ? "Change" : "Add email"}
        </button>
      </div>
      {contact.email && (
        <span
          className={
            contact.emailStatus === "failed"
              ? "text-[#e2b78e]"
              : contact.emailStatus === "confirmed"
                ? "text-[#8fd0a6]"
                : undefined
          }
        >
          {contact.emailStatus === "failed"
            ? "Sign-up failed. Tap Change and save again."
            : contact.emailStatus === "confirmed"
              ? "✓ Confirmed: email alerts are on."
              : "They must click the confirmation link AWS emailed them (check spam)."}
        </span>
      )}
    </div>
  )
}
