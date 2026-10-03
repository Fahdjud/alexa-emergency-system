/*
 * POST /api/telegram/webhook: receives messages sent to the bot. When a
 * contact taps Start from their invite link (t.me/<bot>?start=<code>), this
 * links their Telegram chat to their contact entry.
 *
 * Why this file exists: a Telegram bot can only message people who started a
 * chat with it, and nobody should have to find and type chat IDs. Telegram
 * includes TELEGRAM_WEBHOOK_SECRET in a header on every call, which proves
 * the request came from Telegram.
 */
import { welcomeText } from "@/lib/server/alert-message"
import { secretsMatch } from "@/lib/server/device-token"
import { requireEnv } from "@/lib/server/env"
import { sendTelegramText } from "@/lib/server/providers/notifier-telegram"
import { getStore } from "@/lib/server/providers/store"

type TelegramUpdate = { message?: { chat?: { id?: number }; text?: string } }

export async function POST(request: Request) {
  const presented = request.headers.get("x-telegram-bot-api-secret-token") ?? ""
  if (!secretsMatch(presented, requireEnv("TELEGRAM_WEBHOOK_SECRET"))) return new Response(null, { status: 401 })

  const update = (await request.json().catch(() => ({}))) as TelegramUpdate
  const chatId = update.message?.chat?.id
  const inviteCode = update.message?.text?.match(/^\/start\s+([A-Za-z0-9_-]{1,64})$/)?.[1]
  if (chatId === undefined) return new Response(null, { status: 200 })

  const contact = inviteCode ? await (await getStore()).linkTelegramChat(inviteCode, String(chatId)) : null
  const reply = contact
    ? welcomeText(contact.name)
    : "To become an emergency contact, open the invite link you were sent. / افتح رابط الدعوة الذي وصلك."
  await sendTelegramText(String(chatId), reply).catch((error) => console.error("Telegram reply failed", error))

  // Always 200, otherwise Telegram keeps retrying the same update.
  return new Response(null, { status: 200 })
}
