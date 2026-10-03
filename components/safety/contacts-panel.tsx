"use client"

/*
 * contacts-panel.tsx: lists the emergency contacts in alert order, shows
 * whether each one has connected Telegram, and adds new ones with an invite
 * link to share.
 *
 * Why this file exists: escalation needs contacts, and each contact must open
 * their invite link once so the bot can message them. This is the minimal
 * setup UI; teammates can replace it.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { addContact, listContacts, type ContactView } from "@/lib/client/safety-api"

export function ContactsPanel({ deviceToken }: { deviceToken: string }) {
  const [contacts, setContacts] = useState<ContactView[] | null>(null)
  const [name, setName] = useState("")
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    const list = await listContacts(deviceToken)
    if (list) setContacts(list)
    else setError("Could not load contacts. Check the device token.")
  }, [deviceToken])

  useEffect(() => {
    let cancelled = false
    void listContacts(deviceToken).then((list) => {
      if (cancelled) return
      if (list) setContacts(list)
      else setError("Could not load contacts. Check the device token.")
    })
    return () => {
      cancelled = true
    }
  }, [deviceToken])

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const added = await addContact(name.trim(), (contacts?.length ?? 0) + 1, deviceToken)
    if (!added) return setError("Could not add the contact.")
    setName("")
    setError("")
    await refresh()
  }

  return (
    <div className="grid gap-2">
      <p className="m-0 text-xs text-[#a7adb2]">Contacts are alerted in this order. Each one opens their invite link once to connect Telegram.</p>
      {contacts?.length === 0 && <p className="m-0 text-xs text-[#e2b78e]">No contacts yet: nobody can be alerted.</p>}
      <ol className="m-0 grid gap-1 p-0 pl-5 text-sm">
        {contacts?.map((contact) => (
          <li key={contact.id}>
            {contact.name} {contact.connected ? "✅ connected" : "⏳ not connected yet"}
            {!contact.connected && contact.inviteLink && (
              <a className="ml-2 break-all text-xs text-[#65d6eb]" href={contact.inviteLink} target="_blank" rel="noreferrer">
                {contact.inviteLink}
              </a>
            )}
          </li>
        ))}
      </ol>
      <form className="flex gap-2" onSubmit={add}>
        <input
          className="h-8 flex-1 rounded-md border border-[#263d54] bg-[#091523] px-3 text-sm outline-none focus:border-[#168aa4]"
          aria-label="Contact name"
          placeholder="Name, e.g. Sara (daughter)"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button className="border-[#263c53] bg-[#101e2d] text-[#d4e0ec] hover:bg-[#14283b]" variant="outline" size="sm" type="submit" disabled={!name.trim()}>
          Add contact
        </Button>
        <Button className="border-[#263c53] bg-[#101e2d] text-[#d4e0ec] hover:bg-[#14283b]" variant="outline" size="sm" type="button" onClick={refresh}>
          Refresh
        </Button>
      </form>
      {error && <p className="m-0 text-xs text-[#e2b78e]">{error}</p>}
    </div>
  )
}
