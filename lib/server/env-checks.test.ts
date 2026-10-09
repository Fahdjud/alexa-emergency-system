// Tests for the configuration health check. Every value here is fake.
import { describe, expect, it } from "vitest"

import { checkEnvironment } from "./env-checks"

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url")
const fakeJwt = (claims: object) =>
  `${base64url({ alg: "HS256" })}.${base64url(claims)}.signature`
const fakeSecret = (character: string) => character.repeat(64)

const valid = {
  ANTHROPIC_API_KEY: "sk-ant-api03-fake",
  GROQ_API_KEY: "gsk_fake",
  TELEGRAM_BOT_TOKEN: "123456789:AAFakeFakeFakeFakeFakeFakeFakeFake12",
  TELEGRAM_BOT_USERNAME: "safety_demo_bot",
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: fakeJwt({
    role: "service_role",
    ref: "abcdefghijklmnopqrst",
  }),
  MONITOR_DEVICE_TOKEN: fakeSecret("a"),
  ACK_TOKEN_SECRET: fakeSecret("b"),
  CRON_SECRET: fakeSecret("c"),
  TELEGRAM_WEBHOOK_SECRET: fakeSecret("d"),
}

const resultFor = (env: Record<string, string | undefined>, name: string) =>
  checkEnvironment(env).variables.find((variable) => variable.name === name)

describe("checkEnvironment", () => {
  it("passes a complete local setup and never returns a value", () => {
    const report = checkEnvironment(valid)
    expect(report.deployment).toBe("local")
    expect(report.problems).toEqual([])
    expect(report.readyFor).toEqual({
      "PR 6": true,
      "PR 7": true,
      "PR 8": true,
    })
    const serialized = JSON.stringify(report)
    for (const value of Object.values(valid))
      expect(serialized).not.toContain(value)
  })

  it("requires APP_BASE_URL on production only", () => {
    expect(
      checkEnvironment({ ...valid, VERCEL_ENV: "production" }).readyFor["PR 7"]
    ).toBe(false)
    expect(
      resultFor(
        {
          ...valid,
          VERCEL_ENV: "production",
          APP_BASE_URL: "https://x.vercel.app",
        },
        "APP_BASE_URL"
      )?.status
    ).toBe("ok")
    expect(
      resultFor(
        { ...valid, APP_BASE_URL: "https://x.vercel.app/" },
        "APP_BASE_URL"
      )?.status
    ).toBe("invalid")
  })

  it("rejects a Supabase URL with a path or trailing slash", () => {
    expect(
      resultFor(
        { ...valid, SUPABASE_URL: "https://abc.supabase.co/rest/v1/" },
        "SUPABASE_URL"
      )?.hint
    ).toMatch(/rest\/v1/)
    expect(
      resultFor(
        { ...valid, SUPABASE_URL: "https://abc.supabase.co/" },
        "SUPABASE_URL"
      )?.status
    ).toBe("invalid")
  })

  it("accepts only a Supabase secret key from the same project", () => {
    expect(
      resultFor(
        { ...valid, SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ role: "anon" }) },
        "SUPABASE_SERVICE_ROLE_KEY"
      )?.status
    ).toBe("invalid")
    expect(
      resultFor(
        { ...valid, SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_x" },
        "SUPABASE_SERVICE_ROLE_KEY"
      )?.status
    ).toBe("invalid")
    expect(
      resultFor(
        { ...valid, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_x" },
        "SUPABASE_SERVICE_ROLE_KEY"
      )?.status
    ).toBe("ok")
    const otherProject = fakeJwt({ role: "service_role", ref: "other" })
    expect(
      checkEnvironment({ ...valid, SUPABASE_SERVICE_ROLE_KEY: otherProject })
        .problems[0]
    ).toMatch(/different Supabase project/)
  })

  it("accepts every Anthropic key format except admin keys", () => {
    for (const key of ["sk-ant-api03-x", "sk-ant-usr-x"]) {
      expect(
        resultFor({ ...valid, ANTHROPIC_API_KEY: key }, "ANTHROPIC_API_KEY")
          ?.status
      ).toBe("ok")
    }
    expect(
      resultFor(
        { ...valid, ANTHROPIC_API_KEY: "sk-ant-admin01-x" },
        "ANTHROPIC_API_KEY"
      )?.status
    ).toBe("invalid")
    expect(
      resultFor({ ...valid, ANTHROPIC_API_KEY: "abc" }, "ANTHROPIC_API_KEY")
        ?.status
    ).toBe("invalid")
  })

  it("catches quotes, spaces and missing values", () => {
    expect(
      resultFor({ ...valid, GROQ_API_KEY: '"gsk_x"' }, "GROQ_API_KEY")?.hint
    ).toMatch(/quotes/)
    expect(
      resultFor({ ...valid, GROQ_API_KEY: "gsk_x " }, "GROQ_API_KEY")?.hint
    ).toMatch(/spaces/)
    expect(
      resultFor({ ...valid, GROQ_API_KEY: "" }, "GROQ_API_KEY")?.status
    ).toBe("missing")
  })

  it("checks Telegram formats and provider names", () => {
    expect(
      resultFor(
        { ...valid, TELEGRAM_BOT_USERNAME: "@safety_bot" },
        "TELEGRAM_BOT_USERNAME"
      )?.status
    ).toBe("invalid")
    expect(
      resultFor({ ...valid, TELEGRAM_BOT_TOKEN: "nope" }, "TELEGRAM_BOT_TOKEN")
        ?.status
    ).toBe("invalid")
    expect(
      resultFor({ ...valid, STT_PROVIDER: "openai" }, "STT_PROVIDER")?.status
    ).toBe("invalid")
    expect(resultFor(valid, "STT_PROVIDER")?.status).toBe("ok")
  })

  it("rejects short or reused secrets and NEXT_PUBLIC_ copies", () => {
    expect(
      resultFor({ ...valid, ACK_TOKEN_SECRET: "short" }, "ACK_TOKEN_SECRET")
        ?.status
    ).toBe("invalid")
    const reused = checkEnvironment({ ...valid, CRON_SECRET: fakeSecret("a") })
    expect(reused.problems[0]).toMatch(/same value as MONITOR_DEVICE_TOKEN/)
    expect(reused.readyFor["PR 6"]).toBe(false)
    expect(
      checkEnvironment({ ...valid, NEXT_PUBLIC_GROQ_API_KEY: "x" }).problems[0]
    ).toMatch(/NEXT_PUBLIC_GROQ_API_KEY/)
  })

  it("reports readiness per build step", () => {
    expect(
      checkEnvironment({ ...valid, SUPABASE_URL: undefined }).readyFor
    ).toEqual({ "PR 6": true, "PR 7": true, "PR 8": false })
  })
})

describe("email alert settings", () => {
  const aws = {
    AWS_REGION: "us-east-1",
    AWS_SNS_TOPIC_ARN: "arn:aws:sns:us-east-1:123456789012:home-alerts",
    AWS_ACCESS_KEY_ID: "AKIAFAKEFAKEFAKEFAKE",
    AWS_SECRET_ACCESS_KEY: "f".repeat(40),
  }

  it("is optional, but all four must be set together", () => {
    expect(checkEnvironment(valid).problems).toEqual([])
    expect(checkEnvironment({ ...valid, ...aws }).problems).toEqual([])
    expect(
      checkEnvironment({ ...valid, ...aws, AWS_SECRET_ACCESS_KEY: undefined })
        .problems
    ).toEqual([
      "Email alerts are half set up: also set AWS_SECRET_ACCESS_KEY (or clear all four AWS settings).",
    ])
  })

  it("catches a topic from another region and a pasted console URL", () => {
    expect(
      checkEnvironment({ ...valid, ...aws, AWS_REGION: "eu-west-1" }).problems
    ).toEqual([
      "AWS_REGION is eu-west-1, but the SNS topic is in us-east-1. Set AWS_REGION=us-east-1.",
    ])
    expect(
      resultFor(
        {
          ...aws,
          AWS_SNS_TOPIC_ARN:
            "https://us-east-1.console.aws.amazon.com/sns/v3/home#/topic/arn",
        },
        "AWS_SNS_TOPIC_ARN"
      )?.status
    ).toBe("invalid")
  })
})
