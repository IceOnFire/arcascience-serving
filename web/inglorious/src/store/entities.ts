import type { AppState } from "../../types"

// The other entities (router, model, classify, monitoring, notFound) are created
// automatically, one per type. Charts need one entity each, so they are listed here.
export const entities: Partial<AppState> = {
  categoryChart: { type: "Bar" },
  confidenceChart: { type: "Bar" },
}
