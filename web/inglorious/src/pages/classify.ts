import { handleAsync } from "@inglorious/store/async"
import { Alert } from "@inglorious/ui/alert"
import { Button } from "@inglorious/ui/button"
import { Chip } from "@inglorious/ui/chip"
import { Progress } from "@inglorious/ui/progress"
import { Table, type TableColumn } from "@inglorious/ui/table"
import { Textarea } from "@inglorious/ui/textarea"
import { Typography } from "@inglorious/ui/typography"
import { html } from "@inglorious/web"

import type { AppApi, ClassifyEntity, PredictOutcome } from "../../types"
import { api as client, MAX_TEXTS, type Prediction } from "../api/client"
import { formatPercent, parseTexts } from "../lib/stats"

// One confident prediction and one flagged for review, as in the API's README
const EXAMPLE = "Maximum plasma concentration (Cmax)\nNumber of participants"

const COLUMNS: TableColumn[] = [
  { id: "text", label: "Endpoint" },
  { id: "category", label: "Category" },
  { id: "confidence", label: "Confidence" },
  { id: "alternatives", label: "Alternatives" },
  { id: "review", label: "Review" },
]

// Same markup as the UI table's own cells
const cell = (content: unknown, className = "") =>
  html`<td class="iw-table-cell ${className}">${content}</td>`

// The UI table, with cells that show more than text
const ResultsTable = {
  ...Table,
  renderCell(
    _props: unknown,
    { column, row }: { column: TableColumn; row: Record<string, unknown> },
  ) {
    const p = row.prediction as Prediction
    switch (column.id) {
      case "category":
        return cell(Chip.render({ children: p.category, size: "sm" }))
      case "confidence":
        return cell(
          html`<div class="confidence">
            ${Progress.render({
              value: p.confidence * 100,
              // As a class: @inglorious/ui 8.1.1's linear Progress ignores its color prop
              className: `iw-progress-${p.needs_review ? "warning" : "success"}`,
            })}
            <span>${formatPercent(p.confidence)}</span>
          </div>`,
        )
      case "alternatives":
        return cell(
          p.top
            .slice(1)
            .filter((t) => t.probability >= 0.01) // hide noise
            .map((t) => `${t.category} ${formatPercent(t.probability)}`)
            .join(", "),
          "muted",
        )
      case "review":
        return cell(
          p.needs_review
            ? Chip.render({
                children: "Needs review",
                color: "warning",
                size: "sm",
              })
            : Chip.render({ children: "OK", color: "success", size: "sm" }),
        )
      default:
        return cell(row.text)
    }
  },
}

export const Classify = {
  create(entity: ClassifyEntity) {
    entity.input = EXAMPLE
    entity.results = []
  },

  inputChange(entity: ClassifyEntity, input: string) {
    entity.input = input
  },

  submit(entity: ClassifyEntity, _: unknown, api: AppApi) {
    api.notify(`#${entity.id}:predict`, parseTexts(entity.input))
  },

  ...handleAsync("predict", {
    start(entity: ClassifyEntity) {
      entity.isLoading = true
      entity.error = undefined
    },
    // The texts travel with the response, to pair each with its prediction
    run: async (texts: string[]): Promise<PredictOutcome> => ({
      texts,
      ...(await client.predict(texts)),
    }),
    success(entity: ClassifyEntity, { texts, predictions }: PredictOutcome) {
      entity.results = texts.map((text, i) => ({
        text,
        prediction: predictions[i],
      }))
    },
    error(entity: ClassifyEntity, error: Error) {
      entity.error = error.message
    },
    finally(entity: ClassifyEntity) {
      entity.isLoading = false
    },
  }),

  render(entity: ClassifyEntity, api: AppApi) {
    const texts = parseTexts(entity.input)
    const isTooMany = texts.length > MAX_TEXTS
    const flagged = entity.results.filter(
      (r) => r.prediction.needs_review,
    ).length

    return html`
      <div class="stack">
        ${Textarea.render({
          label: "Clinical trial endpoints, one per line",
          value: entity.input,
          rows: 4,
          isAutoSize: true,
          isFullWidth: true,
          error: isTooMany
            ? `At most ${MAX_TEXTS} endpoints per request`
            : undefined,
          hint: `${texts.length} endpoint${texts.length === 1 ? "" : "s"}`,
          onChange: (value) => api.notify(`#${entity.id}:inputChange`, value),
        })}
        <div>
          ${Button.render({
            type: "Button",
            children: "Classify",
            color: "primary", // the runtime default is a neutral "default"
            isDisabled: entity.isLoading || texts.length === 0 || isTooMany,
            onClick: () => api.notify(`#${entity.id}:submit`),
          })}
        </div>

        ${entity.isLoading ? Progress.render({}) : ""}
        ${entity.error
          ? Alert.render({ severity: "error", children: entity.error })
          : ""}
        ${entity.results.length
          ? html`
              ${Typography.render({
                variant: "caption",
                children: `${entity.results.length} classified, ${flagged} need${flagged === 1 ? "s" : ""} review`,
              })}
              <div class="results-table">
                ${ResultsTable.render({
                  columns: COLUMNS,
                  rows: entity.results.map((r) => ({ ...r })),
                  isFullWidth: true,
                })}
              </div>
            `
          : ""}
      </div>
    `
  },
}
