// Turns API responses into what the UI shows. Pure functions with no React in them,
// so the Inglorious Web version of the app can reuse them as they are.
import type { DriftStatus, Stats } from "../api/client"

export interface ShareRow {
  label: string
  live: number
  baseline: number
}

export const MIN_WINDOW = 100 // the API reports drift from 100 predictions on

/** Category shares, live vs baseline, in the API's category order. */
export function categoryRows(stats: Stats): ShareRow[] {
  return stats.categories.map((c) => ({
    label: c.category,
    live: c.share,
    baseline: c.baseline,
  }))
}

/** Confidence distribution, live vs baseline, one row per bin ("0.7–0.9"). */
export function confidenceRows(stats: Stats): ShareRow[] {
  return stats.confidence.map((c) => ({
    label: `${formatEdge(c.bin[0])}–${formatEdge(c.bin[1])}`,
    live: c.share,
    baseline: c.baseline,
  }))
}

function formatEdge(edge: number): string {
  return Number.isInteger(edge) ? edge.toFixed(0) : String(edge)
}

/** Round percentage ticks for a share axis: 0 up to just above the largest value. */
export function shareTicks(rows: ShareRow[]): number[] {
  const max = Math.max(0.05, ...rows.flatMap((r) => [r.live, r.baseline]))
  const step = max <= 0.3 ? 0.05 : max <= 0.6 ? 0.1 : 0.2
  const count = Math.ceil(max / step - 1e-9)
  // Rounded to avoid floating-point labels such as 0.30000000000000004
  return Array.from(
    { length: count + 1 },
    (_, i) => Math.round(i * step * 100) / 100,
  )
}

export function formatPercent(share: number, digits = 0): string {
  return `${(share * 100).toFixed(digits)}%`
}

const DRIFT_COLORS = {
  stable: "success",
  moderate: "warning",
  significant: "error",
} as const satisfies Record<DriftStatus, string>

/** Palette colour for a drift verdict. */
export function driftColor(status: DriftStatus) {
  return DRIFT_COLORS[status]
}

/** Non-empty, trimmed lines of a text area: one endpoint per line. */
export function parseTexts(input: string): string[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}
