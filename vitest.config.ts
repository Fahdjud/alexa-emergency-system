/*
 * vitest.config.ts: unit test setup for the safety assistant's pure logic.
 *
 * Why this file exists: the repo had no test runner. Vitest runs the
 * TypeScript files directly. The "@/" alias mirrors tsconfig.json so tests
 * import modules the same way the app does, and "server-only" (which throws
 * outside a Next.js server build) becomes its no-op variant.
 */
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url)
      ),
    },
  },
  test: {
    include: ["lib/**/*.test.ts"],
  },
})
