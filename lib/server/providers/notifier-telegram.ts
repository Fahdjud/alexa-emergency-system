/*
 * notifier-telegram.ts: sends alerts through the Telegram Bot API.
 *
 * Why this file exists: Telegram is free, delivers instantly with a push
 * notification, works in Saudi Arabia, and supports a tap-to-acknowledge
 * button and an audio attachment. It is plain HTTPS, so no SDK is added.
 * A bot can only message people who pressed Start in a chat with it, which
 * is how contacts register (see app/api/telegram/webhook).
 */
import "server-only"

import type { Notifier } from "./notifier"

const TIMEOUT_MS = 10_000

export function createTelegramNotifier(): Notifier {
  return {
    canReach: (contact) => contact.telegramChatId !== null,

    async send(contact, message) {
      if (!contact.telegramChatId) throw new Error(`${contact.name} has not connected Telegram yet`)
      const chatId = contact.telegramChatId

      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: message.text,
        reply_markup: message.action ? { inline_keyboard: [[{ text: message.action.label, url: message.action.url }]] } : undefined,
      })

      if (message.audio) {
        const form = new FormData()
        form.append("chat_id", chatId)
        form.append("document", message.audio, "incident-audio.wav")
        form.append("caption", "Audio around the alert / الصوت وقت التنبيه")
        await callTelegram("sendDocument", form)
      }
    },
  }
}

/** Sends a plain message to any chat; used by the webhook to greet new contacts. */
export async function sendTelegramText(chatId: string, text: string): Promise<void> {
  await callTelegram("sendMessage", { chat_id: chatId, text })
}

async function callTelegram(method: string, body: object | FormData): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set")
  const isForm = body instanceof FormData
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  // The URL contains the token, so never include it in the error.
  if (!response.ok) throw new Error(`Telegram ${method} failed with status ${response.status}`)
}
