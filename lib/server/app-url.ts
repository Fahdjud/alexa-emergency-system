/*
 * app-url.ts: the public address of this deployment, for links in alerts.
 *
 * Why this file exists: alerts are opened on a contact's phone, so links must
 * be absolute. Production uses APP_BASE_URL; Vercel previews use the
 * VERCEL_URL that Vercel provides; local development uses localhost.
 */
import "server-only"

export function appBaseUrl(): string {
  if (process.env.APP_BASE_URL)
    return process.env.APP_BASE_URL.replace(/\/+$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT ?? 3000}`
}
