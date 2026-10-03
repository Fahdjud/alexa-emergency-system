# Safety assistant: how it works and how to set it up

This file explains the AI layer added on top of the Alexa-style demo, so that
teammates can find their way around and the setup can be repeated. The demo at
`/` is unchanged. The monitor lives at `/monitor`.

## How it works

1. **Listening (browser, free).** `/monitor` keeps the last 15 s of microphone
   audio in memory. Google's YAMNet model runs in the tab and recognises sounds:
   smoke alarm, glass, screams, thuds. Chrome's speech recognition listens for
   phrases in English or Arabic, such as "help me" or "الحقوني". Every incident
   type is one entry in `lib/safety/incidents.ts`.
2. **AI check (server, about $0.003, speech triggers only).** The snippet (15 s
   before + 6 s after) is transcribed by Groq Whisper and classified by Claude
   Haiku 4.5. Only a confident "not an incident" (the TV, for example) skips
   the next step. Any failure goes on to the next step anyway.
3. **"Are you okay?"** The device asks out loud. "I'm fine" cancels.
   "Help", or no answer within 30 s, escalates. The server also gets its own
   deadline, so a crashed tab still escalates.
4. **Escalation (server, no AI).** Contacts get Telegram messages with the
   audio and an "I'm handling it" link:
   - Critical incidents alert everyone at once, every 2 min.
   - High-severity incidents alert one contact at a time, 3 min each.
   - Medium-severity incidents alert one contact at a time, 5 min each.
   - After that, everyone is alerted 3 more times.
   - The first acknowledgement stops the alerts and tells the others.
5. **Heartbeat.** If the monitor stops checking in for 5 minutes, contact 1 is
   told that nothing is listening.

Snippets are kept for 7 days (incident cancelled) or 30 days (escalated).
Incident records are kept for 90 days.

## Setup checklist (production)

1. **Supabase**
   - In the SQL Editor, run `db/schema.sql`.
   - Under Database → Extensions, enable `pg_cron` and `pg_net`.
   - In Vault, add two secrets:
     - `cron_secret`: your `CRON_SECRET`
     - `app_base_url`: `https://<your-app>.vercel.app`
   - Run `db/schedule.sql`.
   - To check it is working, run
     `select * from cron.job_run_details order by start_time desc limit 5;`
2. **Vercel environment variables** (Production)
   - `STORE_PROVIDER=supabase`
   - `NOTIFIER_PROVIDER=telegram`
   - Every variable from `.env.example`
   - Then redeploy.
3. **Telegram webhook** (once, from your own terminal, in the repo folder):

   ```bash
   set -a; source .env.local; set +a
   curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     -d "url=https://<your-app>.vercel.app/api/telegram/webhook" \
     -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
   ```

   `.env.local` must hold the same `TELEGRAM_WEBHOOK_SECRET` as Vercel.
4. **Check:** open `/health`, enter the device token, and confirm everything shows ✅.
5. **Monitor**
   - Open `/monitor` in Chrome and enter the device token.
   - Under Test tools → Emergency contacts, add contacts and send each one
     their invite link. They tap **Start** in Telegram.
   - Click **Start listening**.

## Running locally

```bash
pnpm install
pnpm dev        # http://localhost:3000/monitor
pnpm test       # unit tests
```

With `STORE_PROVIDER` and `NOTIFIER_PROVIDER` left empty, the app uses an
in-memory store and prints alerts to the terminal, so no database or bot is
needed. `instrumentation.ts` runs the escalation tick every 15 s when
`CRON_SECRET` is set.

## Where things live

| Folder | What |
|---|---|
| `lib/safety/` | Pure rules: incidents config, matching, replies, escalation policy, retention. Shared by browser and server. |
| `lib/audio/` | Browser audio: microphone, ring buffer, WAV, YAMNet, speech recognition and speech output. |
| `hooks/` | React glue. `use-safety-monitor.ts` wires everything together. |
| `lib/server/` | Server only: providers (speech-to-text, classifier, notifier, store), escalation runner, tokens. |
| `app/api/` | API routes. Every route checks the device token, `CRON_SECRET` or the Telegram secret. |
| `db/` | Supabase schema and scheduler. |

Every external service sits behind a small interface in `lib/server/providers/`,
so swapping a provider means adding one file.

## Known limits

- Silent falls (no impact sound, no speech) are not detected.
- TV and radio cause most false triggers. The AI check and the question filter
  out most of them.
- While recognising speech, Chrome sends the audio to Google. Nothing is stored
  by us except the trigger snippets.
- Keep the monitor tab in the foreground on a device that stays plugged in.
- There is no automatic call to emergency services. Messages and the device
  tell people to call 911.
