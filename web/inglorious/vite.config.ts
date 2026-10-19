/// <reference types="vitest/config" />
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { hmr } from "@inglorious/vite-plugin-hmr"
import { minifyTemplateLiterals } from "rollup-plugin-minify-template-literals"
import { defineConfig } from "vite"
import { ViteImageOptimizer } from "vite-plugin-image-optimizer"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// The browser never sees the API key: the dev server forwards /api/* to the API and adds
// the X-API-Key header itself, reading it from api/.env (the file the API reads too).
// Same proxy as the React app.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000"
const ENV_FILE = path.resolve(__dirname, "../../api/.env")

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

// https://vite.dev/config/
export default defineConfig({
  // @see https://github.com/vitejs/vite/issues/1973
  define: { "process.env": {} },

  plugins: [ViteImageOptimizer(), hmr()],

  build: {
    rollupOptions: {
      plugins: [minifyTemplateLiterals()],
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  server: {
    proxy: {
      "/api": {
        target: API_URL,
        rewrite: (p) => p.replace(/^\/api/, ""),
        headers: apiKey ? { "X-API-Key": apiKey } : {},
      },
    },
  },

  test: {
    environment: "node",
  },
})
