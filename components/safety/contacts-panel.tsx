"use client"

/*
 * contacts-panel.tsx: the emergency contacts, in the order they are alerted,
 * with an invite link to share and live "connected" status.
 *
 * Why this file exists: escalation needs people to alert, and each person
 * must open their invite link once so the Telegram bot can message them. Used
 * by the setup screen and the settings; while anyone is still unconnected it
 * refreshes on its own, so the tick appears the moment they tap Start.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Check, Share2, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  addContact,
  listContacts,
  type ContactView,
} from "@/lib/client/safety-api"

const REFRESH_WHILE_WAITING_MS = 4000

export function ContactsPanel({
  deviceToken,
  onChange,
}: {
  deviceToken: string
  /** Called with the latest list, e.g. so the setup screen knows if anyone is connected. */
  onChange?: (contacts: ContactView[]) => void
}) {
  const [contacts, setContacts] = useState<ContactView[] | null>(null)
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const list = await listContacts(deviceToken)
    if (!list) return setError("Could not load contacts.")
    setError("")
    setContacts(list)
    onChange?.(list)
  }, [deviceToken, onChange])

  const waiting = contacts?.some((contact) => !contact.connected) ?? true
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
    const added = await addContact(
      name.trim(),
      (contacts?.length ?? 0) + 1,
      deviceToken
    )
    if (!added) return setError("Could not add the contact.")
    setName("")
    await refresh()
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
    <div className="grid gap-3">
      {contacts && contacts.length === 0 && (
        <p className="m-0 rounded-lg border border-dashed border-[#2a4057] p-4 text-center text-sm text-[#a7adb2]">
          No contacts yet. Add the people who should be alerted, in order.
        </p>
      )}

      <ol className="m-0 grid list-none gap-2 p-0">
        {contacts?.map((contact, index) => (
          <li
            className="flex items-center gap-3 rounded-lg border border-[#23354a] bg-[#0b1624] p-3"
            key={contact.id}
          >
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
                {contact.connected
                  ? "Connected on Telegram"
                  : "Waiting for them to open the invite and tap Start"}
              </span>
            </span>
            {!contact.connected && contact.inviteLink && (
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
                {copiedId === contact.id ? "Copied" : "Send invite"}
              </Button>
            )}
          </li>
        ))}
      </ol>

      <form className="flex gap-2" onSubmit={add}>
        <input
          className="h-10 min-w-0 flex-1 rounded-lg border border-[#263d54] bg-[#091523] px-3 text-sm outline-none focus:border-[#168aa4]"
          aria-label="Contact name"
          placeholder="Name, e.g. Sara (daughter)"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          className="h-10 bg-[#00c8f4] text-[#06131c] hover:bg-[#59ddf5]"
          type="submit"
          disabled={!name.trim()}
        >
          <UserPlus size={15} />
          Add
        </Button>
      </form>
      {error && <p className="m-0 text-xs text-[#e2b78e]">{error}</p>}
    </div>
  )
}
