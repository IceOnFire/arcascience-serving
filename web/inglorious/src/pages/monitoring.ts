import { handleAsync } from "@inglorious/store/async"
import { Alert } from "@inglorious/ui/alert"
import { Card } from "@inglorious/ui/card"
import { Chip } from "@inglorious/ui/chip"
import { Grid } from "@inglorious/ui/grid"
import { Typography } from "@inglorious/ui/typography"
import { html } from "@inglorious/web"

import type { AppApi, MonitoringEntity } from "../../types"
import { api as client, type Stats } from "../api/client"
import * as SharesChart from "../components/shares-chart"
import * as StatCard from "../components/stat-card"
import {
  categoryRows,
  confidenceRows,
  driftColor,
  formatPercent,
  MIN_WINDOW,
} from "../lib/stats"

const REFRESH_MS = 5000
const MS_PER_SECOND = 1000
const PSI_DIGITS = 2

export const Monitoring = {
  // The router broadcasts every route change. Refresh while this page is shown, stop when
  // it isn't: the counterpart of the React page polling while it's mounted.
  routeChange(
    entity: MonitoringEntity,
    { route }: { route?: string },
    api: AppApi,
  ) {
    const id = entity.id
    if (route === id && entity.timerId === undefined) {
      api.notify(`#${id}:load`)
      entity.timerId = window.setInterval(
        () => api.notify(`#${id}:load`),
        REFRESH_MS,
      )
    } else if (route !== id && entity.timerId !== undefined) {
      window.clearInterval(entity.timerId)
      entity.timerId = undefined
    }
  },

  ...handleAsync("load", {
    run: () => client.stats(),
    success(entity: MonitoringEntity, stats: Stats) {
      entity.stats = stats
      entity.updatedAt = Date.now()
      entity.error = undefined
    },
    // Keep showing the last stats when a refresh fails
    error(entity: MonitoringEntity, error: Error) {
      entity.error = error.message
    },
  }),

  render(entity: MonitoringEntity, api: AppApi) {
    const { stats, error, updatedAt } = entity
    if (!stats) {
      return error ? Alert.render({ severity: "error", children: error }) : null
    }

    return html`
      <div class="stack">
        ${Typography.render({
          children: html`The last ${stats.window.capacity} predictions compared
            with the model's baseline, refreshed every
            ${REFRESH_MS / MS_PER_SECOND}
            seconds${updatedAt
              ? ` (last update ${new Date(updatedAt).toLocaleTimeString()})`
              : ""}.
            Run <code>demo/demo.sh drift</code> to see it move.`,
        })}
        ${error
          ? Alert.render({
              severity: "warning",
              children: `Refresh failed: ${error}`,
            })
          : ""}
        ${Grid.render({
          minColumnWidth: "220px",
          gap: "md",
          children: [
            StatCard.render({
              title: "Window",
              value: stats.window.size,
              caption: `of ${stats.window.capacity} predictions`,
            }),
            StatCard.render({
              title: "Needs review",
              value:
                stats.review_rate != null
                  ? formatPercent(stats.review_rate)
                  : "–",
              caption:
                stats.baseline_review_rate != null
                  ? `baseline ${formatPercent(stats.baseline_review_rate)}`
                  : undefined,
            }),
            renderDrift("Category drift", stats, "categories"),
            renderDrift("Confidence drift", stats, "confidence"),
          ],
        })}
        ${stats.window.size > 0
          ? html`
              ${Card.render({
                title: "Predicted categories",
                body: SharesChart.render(
                  { entity: "categoryChart", rows: categoryRows(stats) },
                  api,
                ),
              })}
              ${Card.render({
                title: "Confidence",
                body: SharesChart.render(
                  { entity: "confidenceChart", rows: confidenceRows(stats) },
                  api,
                ),
              })}
            `
          : ""}
      </div>
    `
  },
}

function renderDrift(
  title: string,
  stats: Stats,
  kind: "categories" | "confidence",
) {
  const drift = stats.drift?.[kind]
  if (!drift) {
    return StatCard.render({
      title,
      value: "–",
      caption: `needs ${MIN_WINDOW} predictions (${stats.window.size} so far)`,
    })
  }
  return StatCard.render({
    title,
    value: Chip.render({
      children: drift.status,
      color: driftColor(drift.status),
    }),
    caption: `PSI ${drift.psi.toFixed(PSI_DIGITS)}`,
  })
}
