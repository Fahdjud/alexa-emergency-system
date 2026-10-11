# Alexa Hackathon: Home Safety Assistant

An Alexa-style assistant that keeps an ear on the home. It listens for signs
that someone needs help, asks them out loud whether they are okay, and if they
ask for help or do not answer, alerts their family until someone responds.
Built for households in Saudi Arabia, in English and Saudi Arabic.

| Route      | What it is                                                      |
| ---------- | --------------------------------------------------------------- |
| `/`        | The Alexa-style chat demo, with a simulated fall alert by email |
| `/monitor` | The always-on safety monitor                                    |
| `/health`  | Configuration check for a deployment                            |

## Features

- **Detects** smoke and gas alarms, falls (thuds and sudden impacts), calls for
  help, spoken medical distress ("my chest hurts", "قلبي يعورني"), glass
  breaking, and prolonged screaming or crying.
- **Asks before alerting.** The monitor speaks "Are you okay?" and understands
  the answer by voice in English or Arabic, with large on-screen buttons as a
  fallback. "I'm fine" cancels; "help" or 30 seconds of silence escalates.
- **Filters false alarms** such as the TV with a short AI check (Whisper
  transcription + Claude Haiku 4.5) that can only skip the question when it
  is confident, and never on silence.
- **Escalates on the server**, so alerts continue if the tab closes: Telegram
  messages with the audio clip and one-tap answers (On my way, Calling now,
  I'm handling it), plus email through AWS SNS. Critical incidents alert
  everyone at once; others go to contacts one by one, then to everyone.
- **Closes the loop.** A contact's answer is spoken at home ("Sara is on the
  way to you") and shared with the other contacts.
- **Setup per household**: sensitivity per incident (Off / Normal / High), how
  cautious the AI check is, and emergency contacts with invite links.
- **Test the system**: a practice run that checks the microphone, the voice
  and recognition, and sends contacts a message marked TEST.
- **Reliability**: heartbeat with an "offline" warning to the first contact,
  idempotent escalation steps, and fallbacks at every external call.
- **Privacy**: no continuous recording. Only a short snippet around a trigger
  leaves the device; snippets are deleted after 7 or 30 days, records after 90.

## How it works

```
Browser (/monitor)                              Server (Next.js on Vercel)
──────────────────                              ───────────────────────────
Microphone ─► 15 s ring buffer
          ├─► YAMNet sound classifier ┐
          └─► Speech recognition      ├─► trigger ─► AI check ──► Groq Whisper
                                      │              (speech)     Claude Haiku 4.5
                                      ▼
                          "Are you okay?" (spoken) ─► incident recorded ─► Supabase
                                      │
                       fine ◄─────────┴────────► help / no answer
                     (cancel)                         │
                                                      ▼
                                   escalation runner (pg_cron, every 30 s)
                                       ├─► Telegram: audio + reply buttons
                                       └─► Email (AWS SNS): answer link
                                                      │
                     spoken at home ◄── contact answers (On my way / Calling)
```

Sound classification runs entirely in the browser. Every external service sits
behind a small interface in `lib/server/providers/`, with a free local
fallback (rules classifier, console notifier, in-memory store) for
development.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · MediaPipe
Audio (YAMNet) · Web Speech API · Groq Whisper · Anthropic Claude Haiku 4.5 ·
Telegram Bot API · AWS SNS · Supabase (Postgres, Storage, pg_cron, pg_net,
Vault) · Zod · Vitest

## Getting started

```bash
pnpm install
cp .env.example .env.local   # optional for local development
pnpm dev                     # http://localhost:3000/monitor
```

With no configuration the app runs fully locally: an in-memory store, alerts
printed to the terminal, and rules-based classification. Use Chrome for speech
recognition. For the most natural voice, especially in Arabic, Microsoft Edge
provides neural voices; the monitor picks the best voice available.

## Configuration

All variables are listed and described in [`.env.example`](.env.example).
They are server-only and grouped by feature:

| Feature                 | Variables                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| AI check                | `GROQ_API_KEY`, `ANTHROPIC_API_KEY`                                                                   |
| Telegram alerts         | `NOTIFIER_PROVIDER=telegram`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `APP_BASE_URL`           |
| Email alerts (optional) | `AWS_REGION`, `AWS_SNS_TOPIC_ARN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`                       |
| Database                | `STORE_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`                                |
| Secrets                 | `MONITOR_DEVICE_TOKEN` (household code), `ACK_TOKEN_SECRET`, `CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET` |

After deploying, open `/health` and enter the household code to confirm every
variable is present and well formed.

## Deployment

1. **Supabase**: run [`db/schema.sql`](db/schema.sql), enable `pg_cron` and
   `pg_net`, add the Vault secrets `cron_secret` and `app_base_url`, then run
   [`db/schedule.sql`](db/schedule.sql).
2. **Vercel**: set the environment variables and deploy.
3. **Telegram**: register the webhook
   (`https://<app>/api/telegram/webhook`) with `TELEGRAM_WEBHOOK_SECRET` as the
   secret token.
4. Open `/monitor`, complete the setup, and run **Test the system**.

Step-by-step instructions are in
[`docs/safety-assistant.md`](docs/safety-assistant.md).

## Testing

```bash
pnpm test        # unit and route tests
pnpm scorecard   # speech-rule accuracy per language
pnpm typecheck
pnpm lint
```

The scorecard runs each language's test sentences through the trigger and
reply rules and reports emergencies caught, everyday sentences wrongly
flagged, and replies understood.

## Project structure

| Path                                | Contents                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `app/monitor`, `components/safety/` | Monitor screen, setup, contacts, confirmation prompt, system test                     |
| `hooks/`                            | `use-safety-monitor.ts` ties capture, detection, speech and escalation together       |
| `lib/safety/`                       | Shared rules: incidents, matching, replies, escalation policy, sensitivity, retention |
| `lib/safety/languages/`             | One file per language: phrases, questions, spoken lines and test sentences            |
| `lib/audio/`                        | Microphone, ring buffer, WAV, YAMNet, impact detector, speech in and out              |
| `lib/server/`                       | Escalation runner, alert texts, signed links, configuration checks, providers         |
| `app/api/`                          | API routes (each authenticated by household code, cron secret or Telegram secret)     |
| `db/`                               | Supabase schema and scheduler                                                         |
| `components/alexa/`, `lib/aws/`     | The Alexa-style demo and the SNS email layer                                          |

## Team

- **Fahad Aljudaibi**: Alexa-style assistant app
- **Faris Abushanab**: email alerts with AWS SNS
- **Rinad Almjishai**: home safety monitor and AI layer

## Known limitations

- Silent falls, with no impact sound or speech, cannot be detected from audio.
- Chrome sends audio to Google while recognising speech; only trigger snippets
  are stored by the app.
- The monitor tab must stay open on a powered device; the heartbeat warns
  contacts if it stops.
- There is no automatic call to emergency services: the device and messages
  direct people to call 911 (997 ambulance, 998 civil defence).
- One household per deployment.

## UI components

The UI uses [shadcn/ui](https://ui.shadcn.com). Add a component with
`npx shadcn@latest add <component>`; components are placed in
`components/ui`.
