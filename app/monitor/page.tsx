/*
 * /monitor: the always-on safety monitor.
 */
import type { Metadata } from "next"

import { MonitorScreen } from "@/components/safety/monitor-screen"

export const metadata: Metadata = {
  title: "Safety monitor",
}

export default function MonitorPage() {
  return <MonitorScreen />
}
