/*
 * env-checks.ts: the list of environment variables the safety assistant needs,
 * and pure functions that check each one is present and correctly shaped.
 *
 * Why this file exists: the app had no env handling at all. Mistakes like a
 * pasted URL path, quotes around a value or the wrong Supabase key only show up
 * much later as confusing provider errors. These checks catch them up front.
 * They never return a value, only a status and a hint, so the report is safe
 * to show. They take the env as an argument (no process.env, no network), so
 * they can be tested without Next.js.
 */

export type EnvGroup =
  "AI providers" | "Alerts" | "Database" | "Generated secrets"
export type BuildStep = "PR 6" | "PR 7" | "PR 8"
export type CheckStatus = "ok" | "warning" | "missing" | "invalid"

type Outcome = { status: "ok" | "warning" | "invalid"; hint?: string }

type EnvVarSpec = {
  name: string
  group: EnvGroup
  neededFrom: BuildStep
  /** "always": empty is fine everywhere. "outside-production": empty is fine except on the Production deployment. */
  optional?: "always" | "outside-production"
  check: (value: string) => Outcome
}

export type EnvVarResult = {
  name: string
  group: EnvGroup
  neededFrom: BuildStep
  status: CheckStatus
  hint?: string
}

export type EnvReport = {
  deployment: string
  variables: EnvVarResult[]
  problems: string[]
  readyFor: Record<BuildStep, boolean>
}

type Env = Record<string, string | undefined>

const BUILD_STEPS: BuildStep[] = ["PR 6", "PR 7", "PR 8"]

const ok: Outcome = { status: "ok" }
const invalid = (hint: string): Outcome => ({ status: "invalid", hint })

function oneOf(...allowed: string[]) {
  return (value: string) =>
    allowed.includes(value)
      ? ok
      : invalid(`Must be one of: ${allowed.join(", ")}.`)
}

function prefixed(prefix: string, keyName: string) {
  return (value: string) =>
    value.startsWith(prefix)
      ? ok
      : invalid(`${keyName} keys start with "${prefix}".`)
}

function checkGeneratedSecret(value: string): Outcome {
  if (!/^[A-Za-z0-9_-]+$/.test(value))
    return invalid(
      "Use only A-Z a-z 0-9 _ - (openssl rand -hex 32 output is fine)."
    )
  if (value.length < 32)
    return invalid(
      "Too short. Use at least 32 characters (openssl rand -hex 32 gives 64)."
    )
  return ok
}

/** Workspace keys come in more than one format (sk-ant-api…, sk-ant-usr…); admin keys cannot call Claude. */
function checkAnthropicKey(value: string): Outcome {
  if (value.startsWith("sk-ant-admin"))
    return invalid(
      "This is an Admin API key, which cannot call Claude. Create a normal API key in a workspace."
    )
  if (value.startsWith("sk-ant-")) return ok
  return invalid('Anthropic API keys start with "sk-ant-".')
}

function checkTelegramToken(value: string): Outcome {
  return /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(value)
    ? ok
    : invalid('Expected the BotFather format "<digits>:<letters>".')
}

function checkTelegramUsername(value: string): Outcome {
  if (value.startsWith("@")) return invalid('Remove the leading "@".')
  return /^[A-Za-z][A-Za-z0-9_]{2,}bot$/i.test(value)
    ? ok
    : invalid('Bot usernames end in "bot".')
}

function checkBaseUrl(value: string): Outcome {
  const url = parseUrl(value)
  if (!url)
    return invalid("Not a valid URL. Example: https://your-project.vercel.app")
  const isLocal = url.hostname === "localhost"
  if (url.protocol !== "https:" && !isLocal)
    return invalid("Use https:// (Telegram links need it).")
  if (value.endsWith("/")) return invalid("Remove the trailing slash.")
  if (url.pathname !== "/")
    return invalid("Use only the site address, with no path.")
  return ok
}

function checkSupabaseUrl(value: string): Outcome {
  const url = parseUrl(value)
  if (!url)
    return invalid(
      "Not a valid URL. Example: https://<project-ref>.supabase.co"
    )
  if (url.protocol !== "https:") return invalid("Use https://.")
  if (!url.hostname.endsWith(".supabase.co"))
    return invalid("Expected a host ending in .supabase.co.")
  if (url.pathname !== "/")
    return invalid(
      `Remove the path "${url.pathname}". Use only https://<project-ref>.supabase.co`
    )
  if (value.endsWith("/")) return invalid("Remove the trailing slash.")
  return ok
}

function checkSupabaseSecretKey(value: string): Outcome {
  if (value.startsWith("sb_secret_")) return ok
  if (value.startsWith("sb_publishable_"))
    return invalid("This is the publishable key. Use the secret key.")
  const role = readJwtClaims(value)?.role
  if (role === "service_role") return ok
  if (role === "anon")
    return invalid('This is the "anon" key. Use the "service_role" key.')
  return invalid(
    'Expected the Supabase "service_role" key or an "sb_secret_..." key.'
  )
}

export const ENV_VARS: EnvVarSpec[] = [
  {
    name: "STT_PROVIDER",
    group: "AI providers",
    neededFrom: "PR 6",
    optional: "always",
    check: oneOf("groq", "none"),
  },
  {
    name: "CLASSIFIER_PROVIDER",
    group: "AI providers",
    neededFrom: "PR 6",
    optional: "always",
    check: oneOf("anthropic", "rules"),
  },
  {
    name: "ANTHROPIC_API_KEY",
    group: "AI providers",
    neededFrom: "PR 6",
    check: checkAnthropicKey,
  },
  {
    name: "GROQ_API_KEY",
    group: "AI providers",
    neededFrom: "PR 6",
    check: prefixed("gsk_", "Groq"),
  },
  {
    name: "NOTIFIER_PROVIDER",
    group: "Alerts",
    neededFrom: "PR 7",
    optional: "always",
    check: oneOf("telegram", "console"),
  },
  {
    name: "TELEGRAM_BOT_TOKEN",
    group: "Alerts",
    neededFrom: "PR 7",
    check: checkTelegramToken,
  },
  {
    name: "TELEGRAM_BOT_USERNAME",
    group: "Alerts",
    neededFrom: "PR 7",
    check: checkTelegramUsername,
  },
  {
    name: "APP_BASE_URL",
    group: "Alerts",
    neededFrom: "PR 7",
    optional: "outside-production",
    check: checkBaseUrl,
  },
  {
    name: "STORE_PROVIDER",
    group: "Database",
    neededFrom: "PR 8",
    optional: "always",
    check: oneOf("supabase", "memory"),
  },
  {
    name: "SUPABASE_URL",
    group: "Database",
    neededFrom: "PR 8",
    check: checkSupabaseUrl,
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    group: "Database",
    neededFrom: "PR 8",
    check: checkSupabaseSecretKey,
  },
  {
    name: "MONITOR_DEVICE_TOKEN",
    group: "Generated secrets",
    neededFrom: "PR 6",
    check: checkGeneratedSecret,
  },
  {
    name: "ACK_TOKEN_SECRET",
    group: "Generated secrets",
    neededFrom: "PR 7",
    check: checkGeneratedSecret,
  },
  {
    name: "CRON_SECRET",
    group: "Generated secrets",
    neededFrom: "PR 7",
    check: checkGeneratedSecret,
  },
  {
    name: "TELEGRAM_WEBHOOK_SECRET",
    group: "Generated secrets",
    neededFrom: "PR 7",
    check: checkGeneratedSecret,
  },
]

/** Checks one variable. Problems common to every value (spaces, quotes) are caught before the specific check. */
export function checkVariable(
  spec: EnvVarSpec,
  rawValue: string | undefined,
  isProduction: boolean
): EnvVarResult {
  const base = {
    name: spec.name,
    group: spec.group,
    neededFrom: spec.neededFrom,
  }

  if (rawValue === undefined || rawValue === "") {
    const emptyIsFine =
      spec.optional === "always" ||
      (spec.optional === "outside-production" && !isProduction)
    return emptyIsFine
      ? { ...base, status: "ok", hint: "Empty, so the default applies." }
      : { ...base, status: "missing" }
  }
  if (rawValue !== rawValue.trim())
    return {
      ...base,
      status: "invalid",
      hint: "Remove the spaces or line breaks around the value.",
    }
  if (/^["']|["']$/.test(rawValue))
    return {
      ...base,
      status: "invalid",
      hint: "Remove the quotes around the value.",
    }

  return { ...base, ...spec.check(rawValue) }
}

/** Checks every variable, plus rules that span several variables. */
export function checkEnvironment(env: Env): EnvReport {
  const deployment = env.VERCEL_ENV ?? "local"
  const variables = ENV_VARS.map((spec) =>
    checkVariable(spec, env[spec.name], deployment === "production")
  )
  const problems = [
    ...findPublicLeaks(env),
    ...findReusedSecrets(env),
    ...findSupabaseProjectMismatch(env),
  ]

  return {
    deployment,
    variables,
    problems,
    readyFor: readinessByStep(variables, problems.length === 0),
  }
}

/** A NEXT_PUBLIC_ copy of any of these would be inlined into the browser bundle. */
function findPublicLeaks(env: Env): string[] {
  return ENV_VARS.filter((spec) => env[`NEXT_PUBLIC_${spec.name}`]).map(
    (spec) =>
      `NEXT_PUBLIC_${spec.name} is set. Delete it: NEXT_PUBLIC_ values are sent to every browser.`
  )
}

function findReusedSecrets(env: Env): string[] {
  const names = ENV_VARS.filter(
    (spec) => spec.group === "Generated secrets"
  ).map((spec) => spec.name)
  const seen = new Map<string, string>()
  const problems: string[] = []
  for (const name of names) {
    const value = env[name]
    if (!value) continue
    const earlier = seen.get(value)
    if (earlier)
      problems.push(
        `${name} has the same value as ${earlier}. Generate a different value for each secret.`
      )
    else seen.set(value, name)
  }
  return problems
}

/** Legacy service_role keys name their project; catch a key pasted from a different project. */
function findSupabaseProjectMismatch(env: Env): string[] {
  const keyRef = readJwtClaims(env.SUPABASE_SERVICE_ROLE_KEY ?? "")?.ref
  const urlRef = parseUrl(env.SUPABASE_URL ?? "")?.hostname.split(".")[0]
  if (typeof keyRef !== "string" || !urlRef || keyRef === urlRef) return []
  return [
    "SUPABASE_SERVICE_ROLE_KEY belongs to a different Supabase project than SUPABASE_URL.",
  ]
}

/** A step is ready when every variable it needs, and every earlier step needs, is usable. */
function readinessByStep(
  variables: EnvVarResult[],
  noProblems: boolean
): Record<BuildStep, boolean> {
  const usable = (result: EnvVarResult) =>
    result.status === "ok" || result.status === "warning"
  const entries = BUILD_STEPS.map((step, index) => {
    const needed = variables.filter(
      (result) => BUILD_STEPS.indexOf(result.neededFrom) <= index
    )
    return [step, noProblems && needed.every(usable)] as const
  })
  return Object.fromEntries(entries) as Record<BuildStep, boolean>
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Reads the (unverified) claims of a JWT. Only "role" and "ref" are used, and they are not secret. */
function readJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
  } catch {
    return null
  }
}
