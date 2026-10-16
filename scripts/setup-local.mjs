/*
 * Prepares a local run: creates .env.local from .env.example and fills in the
 * two secrets a local run needs (ACK_TOKEN_SECRET and CRON_SECRET) with fresh
 * random values. Values already set in .env.local are never changed.
 *
 * Usage: pnpm setup-local
 */
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const TARGET = ".env.local"
const GENERATED = ["ACK_TOKEN_SECRET", "CRON_SECRET"]

const created = !existsSync(TARGET)
let text = readFileSync(created ? ".env.example" : TARGET, "utf8")

const filled = []
for (const name of GENERATED) {
  const line = new RegExp(`^${name}=(.*)$`, "m")
  const current = text.match(line)
  if (current && current[1].trim()) continue
  const entry = `${name}=${randomBytes(32).toString("hex")}`
  text = current ? text.replace(line, entry) : `${text.trimEnd()}\n${entry}\n`
  filled.push(name)
}

writeFileSync(TARGET, text)
console.log(
  created ? `Created ${TARGET} from .env.example.` : `Updated ${TARGET}.`
)
console.log(
  filled.length
    ? `Generated ${filled.join(" and ")}.`
    : "Secrets were already set; nothing changed."
)
console.log(
  "Next: pnpm dev, then open http://localhost:3000/monitor in Chrome."
)
