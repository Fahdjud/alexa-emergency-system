/*
 * /monitor: the always-on safety monitor page.
 *
 * Why this file exists: "/" is the existing Alexa demo, which stays as it is.
 * The monitor is a separate route that reuses the same styling and components.
 */
import type { Metadata } from "next"

import { MonitorScreen } from "@/components/safety/monitor-screen"

export const metadata: Metadata = {
  title: "Safety monitor",
}

export default function MonitorPage() {
  return <MonitorScreen />
}
