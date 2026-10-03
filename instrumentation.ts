/*
 * instrumentation.ts: runs once when the Next.js server starts. Outside
 * Vercel it calls the escalation tick every 15 s, so alerts keep going when
 * you run the app locally.
 *
 * Why this file exists: escalation is driven by a scheduler calling
 * /api/escalation/tick. In production that is Supabase pg_cron; locally there
 * is no scheduler, and nothing else in the app runs on a timer. It calls the
 * real HTTP route with CRON_SECRET, so the local path matches production.
 */
const LOCAL_TICK_MS = 15_000

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL) return
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.warn(
      "CRON_SECRET is not set, so the local escalation ticker is off."
    )
    return
  }

  const url = `http://localhost:${process.env.PORT ?? 3000}/api/escalation/tick`
  setInterval(() => {
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    }).catch(() => {
      // The server may still be starting; the next tick retries.
    })
  }, LOCAL_TICK_MS)
}
