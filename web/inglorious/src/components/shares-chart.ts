import { Chart } from "@inglorious/charts"

import type { AppApi } from "../../types"
import type { ShareRow } from "../lib/stats"

export interface SharesChartProps {
  /** Id of the chart entity, which holds the tooltip state */
  entity: string
  rows: ShareRow[]
  height?: number
}

const COLORS = ["var(--iw-color-primary)", "var(--iw-color-gray-500)"]

// Live vs baseline as grouped bars, like the React app's SharesChart. Two differences
// come from the chart library: the Y axis has no tick formatter, so shares are plotted in
// percentage points (the card titles say "%"), and the legend shows each series' data
// key, so the keys are the labels themselves.
export function render(
  { entity, rows, height = 300 }: SharesChartProps,
  api: AppApi,
) {
  const data = rows.map((row) => ({
    label: row.label,
    Live: Math.round(row.live * 1000) / 10,
    Baseline: Math.round(row.baseline * 1000) / 10,
  }))

  return Chart.render(
    {
      entity,
      // The SVG has a viewBox, so it scales to its container's width (see app.css)
      width: 1100,
      height,
      data,
      children: [
        Chart.CartesianGrid({ strokeDasharray: "3 3" }),
        Chart.XAxis({ dataKey: "label" }),
        Chart.YAxis(),
        Chart.Bar({ dataKey: "Live", fill: COLORS[0] }),
        Chart.Bar({ dataKey: "Baseline", fill: COLORS[1] }),
        Chart.Tooltip(),
        // The legend has its own palette: give it the bars' colours
        Chart.Legend({ colors: COLORS }),
      ],
    },
    api,
  )
}
