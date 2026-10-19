import {
  Bar,
  CartesianGrid,
  Chart,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "@inglorious/charts"

import type { AppApi } from "../../types"
import { formatPercent, type ShareRow } from "../lib/stats"

const DEFAULT_HEIGHT = 300

export interface SharesChartProps {
  /** Id of the chart entity, which holds the tooltip state */
  entity: string
  rows: ShareRow[]
  height?: number
}

// Live vs baseline as grouped bars, like the React app's SharesChart. The legend names
// each series after its data key, so the keys are the labels themselves.
export function render(
  { entity, rows, height = DEFAULT_HEIGHT }: SharesChartProps,
  api: AppApi,
) {
  const data = rows.map(({ label, live, baseline }) => ({
    label,
    Live: live,
    Baseline: baseline,
  }))

  return Chart.render(
    {
      entity,
      // The SVG has a viewBox, so it scales to its container's width (see app.css)
      width: 1100,
      height,
      data,
      children: [
        CartesianGrid({ strokeDasharray: "3 3" }),
        XAxis({ dataKey: "label", interval: 0 }), // every category, like the React chart
        YAxis({ tickFormatter: (value) => formatPercent(value) }),
        Bar({ dataKey: "Live", fill: "var(--iw-color-primary)" }),
        Bar({ dataKey: "Baseline", fill: "var(--iw-color-gray-500)" }),
        Tooltip({ formatter: (value) => formatPercent(Number(value), 1) }),
        Legend(),
      ],
    },
    // @inglorious/charts 11.1.0 types `api` as the default Api<BaseEntity>, which an app's
    // own Api<AppEntity, AppState> isn't assignable to
    api as Parameters<typeof Chart.render>[1],
  )
}
