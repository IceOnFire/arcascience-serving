/// <reference types="vitest/config" />
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The browser never sees the API key: the dev server forwards /api/* to the API and adds
// the X-API-Key header itself, reading it from api/.env (the file the API reads too).
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000"
const ENV_FILE = fileURLToPath(new URL("../../api/.env", import.meta.url))

function readApiKey(): string | undefined {
  try {
    const line = readFileSync(ENV_FILE, "utf8")
      .split("\n")
      .find((l) => l.startsWith("API_KEY="))
    return line?.slice("API_KEY=".length).trim()
  } catch {
    console.warn(
      `No ${ENV_FILE}: API calls will fail with 401 (run api/setup.sh)`,
    )
    return undefined
  }
}

const apiKey = readApiKey()

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: API_URL,
        rewrite: (path) => path.replace(/^\/api/, ""),
        headers: apiKey ? { "X-API-Key": apiKey } : {},
      },
    },
  },
  test: {
    environment: "node",
  },
})
