import { describe, expect, it } from "vitest"

import type { Stats } from "../api/client"
import {
  categoryRows,
  confidenceRows,
  driftColor,
  formatPercent,
  parseTexts,
  shareTicks,
} from "./stats"

const stats: Stats = {
  window: { size: 2, capacity: 1000, since: 0 },
  review_rate: 0.5,
  baseline_review_rate: 0.389,
  categories: [
    { category: "General Case", share: 0.5, baseline: 0.288 },
    { category: "Pharmacokinetic", share: 0.5, baseline: 0.1528 },
  ],
  confidence: [
    { bin: [0, 0.5], share: 0, baseline: 0.08 },
    { bin: [0.9, 1], share: 0.5, baseline: 0.611 },
  ],
  drift: null,
}

describe("categoryRows", () => {
  it("pairs live and baseline shares per category, in API order", () => {
    expect(categoryRows(stats)).toEqual([
      { label: "General Case", live: 0.5, baseline: 0.288 },
      { label: "Pharmacokinetic", live: 0.5, baseline: 0.1528 },
    ])
  })
})

describe("confidenceRows", () => {
  it("labels bins by their edges", () => {
    expect(confidenceRows(stats).map((r) => r.label)).toEqual([
      "0–0.5",
      "0.9–1",
    ])
  })
})

describe("driftColor", () => {
  it.each([
    ["stable", "success"],
    ["moderate", "warning"],
    ["significant", "error"],
  ] as const)("%s is %s", (status, color) => {
    expect(driftColor(status)).toBe(color)
  })
})

describe("formatPercent", () => {
  it("rounds to the requested digits", () => {
    expect(formatPercent(0.3891)).toBe("39%")
    expect(formatPercent(0.3891, 1)).toBe("38.9%")
  })
})

describe("parseTexts", () => {
  it("keeps one trimmed endpoint per non-empty line", () => {
    expect(parseTexts("  Cmax \n\n Body weight\n   \n")).toEqual([
      "Cmax",
      "Body weight",
    ])
  })
})

describe("shareTicks", () => {
  const row = (live: number) => ({ label: "x", live, baseline: 0 })
  it("uses 5% steps for small shares", () => {
    expect(shareTicks([row(0.288)])).toEqual([
      0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3,
    ])
  })
  it("uses larger steps for large shares", () => {
    expect(shareTicks([row(0.611)])).toEqual([0, 0.2, 0.4, 0.6, 0.8])
    expect(shareTicks([row(1)])).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })
  it("stops at the value when it falls on a tick", () => {
    expect(shareTicks([row(0.3)])).toEqual([0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3])
  })
})
