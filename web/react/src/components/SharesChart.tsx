import { useTheme } from "@mui/material/styles"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatPercent, type ShareRow, shareTicks } from "../lib/stats"

interface Props {
  rows: ShareRow[]
  height?: number
}

// Live vs baseline as grouped bars. Only features that Inglorious Charts also has (bars,
// axes, grid, tooltip, legend; no animation), so the Inglorious version can match it.
// Without animation, the bars also don't replay every time the page refreshes.
export function SharesChart({ rows, height = 300 }: Props) {
  // CSS variable references, not colour values: the browser resolves them for the
  // current light or dark scheme (fixed values would be the light scheme's)
  const { palette } = useTheme().vars!
  const ticks = shareTicks(rows)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={palette.divider} />
        <XAxis
          dataKey="label"
          tick={{ fill: palette.text.secondary, fontSize: 12 }}
          interval={0}
        />
        <YAxis
          ticks={ticks}
          domain={[0, ticks[ticks.length - 1]]}
          tickFormatter={(v: number) => formatPercent(v)}
          tick={{ fill: palette.text.secondary, fontSize: 12 }}
          width={48}
        />
        <Tooltip
          formatter={(value) => formatPercent(Number(value), 1)}
          contentStyle={{
            background: palette.background.paper,
            border: `1px solid ${palette.divider}`,
          }}
        />
        {/* Live first, like the bars (Recharts sorts by name by default) */}
        <Legend itemSorter={(item) => (item.dataKey === "live" ? 0 : 1)} />
        <Bar
          dataKey="live"
          name="Live"
          fill={palette.primary.main}
          isAnimationActive={false}
        />
        <Bar
          dataKey="baseline"
          name="Baseline"
          fill={palette.grey[500]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
