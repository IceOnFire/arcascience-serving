import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Card from "@mui/material/Card"
import CardContent from "@mui/material/CardContent"
import Chip from "@mui/material/Chip"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import type { ReactNode } from "react"

import { api, type Stats } from "../api/client"
import { SharesChart } from "../components/SharesChart"
import { StatCard } from "../components/StatCard"
import {
  categoryRows,
  confidenceRows,
  driftColor,
  formatPercent,
  MIN_WINDOW,
} from "../lib/stats"
import { usePolling } from "../lib/usePolling"

const REFRESH_MS = 5000

export function MonitoringPage() {
  const { data: stats, error, updatedAt } = usePolling(api.stats, REFRESH_MS)

  if (!stats) {
    return error ? <Alert severity="error">{error.message}</Alert> : null
  }

  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        The last {stats.window.capacity} predictions compared with the model's
        baseline, refreshed every {REFRESH_MS / 1000} seconds
        {updatedAt && ` (last update ${updatedAt.toLocaleTimeString()})`}. Run{" "}
        <code>demo/demo.sh drift</code> to see it move.
      </Typography>
      {error && (
        <Alert severity="warning">Refresh failed: {error.message}</Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <StatCard
          title="Window"
          value={stats.window.size}
          caption={`of ${stats.window.capacity} predictions`}
        />
        <StatCard
          title="Needs review"
          value={
            stats.review_rate != null ? formatPercent(stats.review_rate) : "–"
          }
          caption={
            stats.baseline_review_rate != null &&
            `baseline ${formatPercent(stats.baseline_review_rate)}`
          }
        />
        <DriftCard title="Category drift" stats={stats} kind="categories" />
        <DriftCard title="Confidence drift" stats={stats} kind="confidence" />
      </Box>

      {stats.window.size > 0 && (
        // Full width: the 9 category names need the room
        <Stack spacing={2}>
          <ChartCard title="Predicted categories">
            <SharesChart rows={categoryRows(stats)} />
          </ChartCard>
          <ChartCard title="Confidence">
            <SharesChart rows={confidenceRows(stats)} />
          </ChartCard>
        </Stack>
      )}
    </Stack>
  )
}

function DriftCard({
  title,
  stats,
  kind,
}: {
  title: string
  stats: Stats
  kind: "categories" | "confidence"
}) {
  const drift = stats.drift?.[kind]
  if (!drift) {
    return (
      <StatCard
        title={title}
        value="–"
        caption={`needs ${MIN_WINDOW} predictions (${stats.window.size} so far)`}
      />
    )
  }
  return (
    <StatCard
      title={title}
      value={<Chip label={drift.status} color={driftColor(drift.status)} />}
      caption={`PSI ${drift.psi.toFixed(2)}`}
    />
  )
}

function ChartCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" gutterBottom>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  )
}
