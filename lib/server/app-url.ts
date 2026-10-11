/*
 * The public base URL used in alert links: APP_BASE_URL in production,
 * VERCEL_URL on preview deployments, localhost in development.
 */
import "server-only"

export function appBaseUrl(): string {
  if (process.env.APP_BASE_URL)
    return process.env.APP_BASE_URL.replace(/\/+$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT ?? 3000}`
}
