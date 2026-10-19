// Typed client for the API. The types come from schema.d.ts, generated from api/openapi.json
// (pnpm gen:api), so they always match the backend. Requests go to /api/*, which the Vite
// dev server forwards to the API with the key added (see vite.config.ts).
import type { components } from "./schema"

type Schemas = components["schemas"]
export type Prediction = Schemas["Prediction"]
export type PredictResponse = Schemas["PredictResponse"]
export type Stats = Schemas["Stats"]
export type Manifest = Schemas["Manifest"]
export type DriftStatus = Schemas["DriftScore"]["status"]

export const MAX_TEXTS = 256

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response))
  }
  return response.json() as Promise<T>
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const { detail } = await response.json()
    // FastAPI validation errors (422) are a list; the others a string
    return Array.isArray(detail)
      ? detail.map((d: { msg: string }) => d.msg).join("; ")
      : String(detail)
  } catch {
    return `HTTP ${response.status}`
  }
}

export const api = {
  predict: (texts: string[]) =>
    request<PredictResponse>("/predict", {
      method: "POST",
      body: JSON.stringify({ texts }),
    }),
  stats: () => request<Stats>("/stats"),
  model: () => request<Manifest>("/model"),
}
