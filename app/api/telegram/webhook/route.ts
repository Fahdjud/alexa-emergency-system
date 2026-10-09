/*
 * POST /api/telegram/webhook: receives what contacts send to the bot.
 * - Start from an invite link (t.me/<bot>?start=<code>) links their chat to
 *   their contact entry.
 * - A tap on an alert's reply button ("On my way", "Calling now", "I'm
 *   handling it") answers the alert: escalation stops, the others are told,
 *   and the monitor at home says who is coming.
 *
 * Why this file exists: a Telegram bot can only message people who started a
 * chat with it, and nobody should have to find and type chat IDs. Telegram
 * includes TELEGRAM_WEBHOOK_SECRET in a header on every call, which proves
 * the request came from Telegram. A button tap is trusted only from the chat
 * of a registered contact.
 */
import {
  alertClosedText,
  alreadyHandledText,
  responseReceivedText,
  welcomeText,
} from "@/lib/server/alert-message"
import { secretsMatch } from "@/lib/server/device-token"
import { requireEnv } from "@/lib/server/env"
import { escalationDeps } from "@/lib/server/escalation-deps"
import {
  acknowledgeIncident,
  decodeReply,
} from "@/lib/server/escalation-runner"
import {
  answerTelegramButton,
  sendTelegramText,
} from "@/lib/server/providers/notifier-telegram"
import { getStore } from "@/lib/server/providers/store"

type TelegramUpdate = {
  message?: { chat?: { id?: number }; text?: string }
  callback_query?: {
    id?: string
    data?: string
    message?: { chat?: { id?: number } }
  }
}

export async function POST(request: Request) {
  const presented = request.headers.get("x-telegram-bot-api-secret-token") ?? ""
  if (!secretsMatch(presented, requireEnv("TELEGRAM_WEBHOOK_SECRET")))
    return new Response(null, { status: 401 })

  const update = (await request.json().catch(() => ({}))) as TelegramUpdate
  if (update.callback_query) await handleButton(update.callback_query)
  else await handleMessage(update.message)

  // Always 200, otherwise Telegram keeps retrying the same update.
  return new Response(null, { status: 200 })
}

async function handleMessage(message: TelegramUpdate["message"]) {
  const chatId = message?.chat?.id
  if (chatId === undefined) return
  const inviteCode = message?.text?.match(
    /^\/start\s+([A-Za-z0-9_-]{1,64})$/
  )?.[1]
  const contact = inviteCode
    ? await (await getStore()).linkTelegramChat(inviteCode, String(chatId))
    : null
  const reply = contact
    ? welcomeText(contact.name)
    : "To become an emergency contact, open the invite link you were sent. / افتح رابط الدعوة الذي وصلك."
  await sendTelegramText(String(chatId), reply).catch((error) =>
    console.error("Telegram reply failed", error)
  )
}

async function handleButton(
  query: NonNullable<TelegramUpdate["callback_query"]>
) {
  const chatId = query.message?.chat?.id
  const reply = decodeReply(query.data ?? "")
  if (!query.id || chatId === undefined || !reply) return

  const deps = await escalationDeps()
  const contact = (await deps.store.listContacts()).find(
    (entry) => entry.telegramChatId === String(chatId)
  )
  let text: string
  if (!contact) {
    text =
      "You are not an emergency contact for this home. / لست جهة اتصال لهذا المنزل."
  } else {
    const result = await acknowledgeIncident(
      deps,
      { incidentId: reply.incidentId, contactId: contact.id },
      reply.response
    )
    text =
      result.outcome === "acknowledged"
        ? responseReceivedText(reply.response)
        : result.outcome === "already-handled"
          ? alreadyHandledText(result.by)
          : alertClosedText(result.incident?.status ?? null)
  }

  await Promise.all([
    answerTelegramButton(query.id, text),
    sendTelegramText(String(chatId), text),
  ]).catch((error) => console.error("Telegram reply failed", error))
}
