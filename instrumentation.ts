/*
 * Development scheduler: outside Vercel, calls /api/escalation/tick every 15 s
 * through the real HTTP route, matching what Supabase pg_cron does in
 * production.
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
