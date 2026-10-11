# Safety assistant: technical guide

How the home safety monitor at `/monitor` works, how it is configured, and how
to deploy it. See the [README](../README.md) for an overview.

## How it works

1. **Listening (browser, free).** `/monitor` keeps the last 15 s of microphone
   audio in memory. Google's YAMNet model runs in the tab and recognises sounds:
   smoke alarm, glass, screams, thuds. Chrome's speech recognition listens for
   phrases in English or Arabic, such as "help me" or "الحقوني". Every incident
   type is one entry in `lib/safety/incidents.ts`; the words for it are in
   the language packs (see "Languages" below).
2. **AI check (server, speech triggers only, well under a cent per check).** The snippet (15 s
   before + 6 s after) is transcribed by Groq Whisper and classified by Claude
   Haiku 4.5. Only a confident "not an incident" (the TV, for example) skips
   the next step. Any failure goes on to the next step anyway.
3. **"Are you okay?"** The device asks out loud, using the best voice the
   browser offers for the language (Microsoft Edge has natural Saudi Arabic
   voices). "I'm fine" cancels.
   "Help", or no answer within 30 s, escalates. The server also gets its own
   deadline, so a crashed tab still escalates.
4. **Escalation (server, no AI).** Contacts get Telegram messages with the
   audio and three one-tap answers: **On my way**, **Calling now** and
   **I'm handling it**. Email contacts get one email per incident with a link
   to the same three answers (the page asks who is answering).
   - Critical incidents alert everyone at once, every 2 min.
   - High-severity incidents alert one contact at a time, 3 min each.
   - Medium-severity incidents alert one contact at a time, 5 min each.
   - After that, everyone is alerted 3 more times.
   - The first answer stops the alerts and tells the others ("Sara is on the
     way"). The monitor says it out loud at home ("Sara is on the way to
     you"). The same contact can change their answer later.
5. **Heartbeat.** If the monitor stops checking in for 5 minutes, contact 1 is
   told that nothing is listening.

### Setup screen and sensitivity

The first time `/monitor` opens, a short setup asks:

- **Household code.** The `MONITOR_DEVICE_TOKEN`, verified with the server.
  A passphrase of several words joined by `-` (at least 32 characters) is
  easy to type and still hard to guess.
- **Language** spoken at home.
- **What to watch for.** Each incident can be set to Off, Normal or High.
  High lowers that incident's sound thresholds, always asks without an AI
  check, and for falls also treats any sudden loud impact as a possible fall.
- **When to ask:**
  - _Always ask_: no AI check at all.
  - _Balanced_: the AI may skip the question only when it is 90% sure nothing
    is wrong.
  - _Fewer interruptions_: 75%, with slightly stronger sounds needed.
  - The AI never skips the question when no words were recognised.
- **Emergency contacts**, with share/copy invite links.

**Test the system** (end of setup, and a card on the monitor screen) checks
the microphone, that the monitor speaks, and that it understands a spoken
answer. Optionally it sends contacts a message marked TEST with the same
reply buttons. Their answer is spoken at home, which proves the whole loop.
A test never repeats or escalates, can't run during a real alert, and
can run at most once every 30 seconds.

The answers are saved in the browser. The rules that turn them into
detection settings are in `lib/safety/profile.ts`. Settings (the gear icon)
reopens the setup.

### Languages

Everything the assistant listens for or says in a language is one file in
`lib/safety/languages/` (`en.ts`, `ar.ts`). The Arabic pack is written for
Saudi and Gulf speech, plus the common Modern Standard Arabic forms.

To add a language (Urdu, Hindi, Tagalog, ...):

1. Copy `en.ts` to `<code>.ts` (the ISO 639-1 code, e.g. `ur`) and have a
   native speaker translate the phrases, the questions and the spoken lines,
   and write the test sentences.
2. Import it in `lib/safety/languages/index.ts` and add it to
   `LANGUAGE_PACKS`.
3. Run `pnpm scorecard` and `pnpm test`. The language switch, speech
   recognition, matching, answers, spoken lines and the AI check pick it up
   with no other change. (Telegram and email texts to contacts stay in
   English and Arabic.)

### Accuracy scorecard

`pnpm scorecard` runs each pack's test sentences through the speech rules
and prints, per language: emergencies caught, everyday sentences wrongly
flagged, and answers to "Are you okay?" read correctly, with every sentence
that failed. It measures the keyword layer only; the AI check and the
question handle the rest (the TV, for example). The test fails if a language
misses an emergency sentence or flags more than 1 in 5 everyday ones.

When testers find a phrase that was missed, add it to the pack's phrases and
to its test sentences, so it stays fixed.

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
   - After updates, run `db/schema.sql` again: it is safe to re-run and adds
     any new columns.
   - To check it is working, run
     `select status, start_time from cron.job_run_details order by start_time desc limit 5;`
     Every run should be `succeeded`. Then
     `select status_code from net._http_response order by created desc limit 5;`
     should show `200` (a `401` means the Vault `cron_secret` differs from
     `CRON_SECRET`).
2. **Vercel environment variables** (Production)
   - `STORE_PROVIDER=supabase`
   - `NOTIFIER_PROVIDER=telegram`
   - The remaining variables from `.env.example`
   - Redeploy after any change.
3. **Telegram webhook** (once, from your own terminal, in the repo folder):

   ```bash
   set -a; source .env.local; set +a
   curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     -d "url=https://<your-app>.vercel.app/api/telegram/webhook" \
     -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
   ```

   `.env.local` must hold the same `TELEGRAM_WEBHOOK_SECRET` as Vercel.

4. **Email alerts (optional, AWS SNS)**
   - In AWS → SNS, create a Standard topic. Create an IAM user that may only
     `sns:Publish`, `sns:Subscribe` and `sns:ListSubscriptionsByTopic` on that
     topic, and an access key for it. (The last one lets the contacts screen
     show who has confirmed their email.)
   - In Vercel, set `AWS_REGION`, `AWS_SNS_TOPIC_ARN`, `AWS_ACCESS_KEY_ID`
     and `AWS_SECRET_ACCESS_KEY`, then redeploy. All four, or none.
   - If you ran `db/schema.sql` before email existed, run it again (it only
     adds the new columns).
   - Add each contact's email on the setup screen. AWS emails them a
     confirmation link they must click once (it may land in spam).
   - When an incident escalates, one email goes to everyone confirmed on the
     topic. It links to a page where the reader picks their name and answers
     On my way, Calling now or I'm handling it, just like the Telegram
     buttons.
5. **Check:** open `/health`, enter the household code, and confirm everything shows ✅.
6. **Monitor:** open `/monitor` in Chrome and follow the setup screen.
   Add contacts and send each one their invite link; they tap **Start** in
   Telegram. Then click **Start monitoring**.

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

| Folder                       | What                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `lib/safety/`                | Pure rules: incidents config, matching, replies, escalation policy, retention. Shared by browser and server. |
| `lib/audio/`                 | Browser audio: microphone, ring buffer, WAV, YAMNet, speech recognition and speech output.                   |
| `hooks/`                     | React glue. `use-safety-monitor.ts` wires everything together.                                               |
| `lib/server/`                | Server only: providers (speech-to-text, classifier, notifier, store), escalation runner, tokens.             |
| `app/api/`                   | API routes. Every route checks the household code, `CRON_SECRET` or the Telegram secret.                     |
| `db/`                        | Supabase schema and scheduler.                                                                               |
| `lib/aws/`, `lib/emergency/` | Email alerts through AWS SNS (sending and topic sign-up).                                                    |

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
