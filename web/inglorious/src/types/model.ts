import { handleAsync } from "@inglorious/store/async"
import { Chip } from "@inglorious/ui/chip"
import { Tooltip } from "@inglorious/ui/tooltip"

import type { AppApi, ModelEntity } from "../../types"
import { api as client, type Manifest } from "../api/client"
import { formatPercent } from "../lib/stats"

// The model version chip in the app bar. The manifest is loaded once, when the entity
// is created; the pages work without it, so a failure only hides the chip.
export const Model = {
  create(entity: ModelEntity, _: unknown, api: AppApi) {
    api.notify(`#${entity.id}:load`)
  },

  ...handleAsync("load", {
    run: () => client.model(),
    success(entity: ModelEntity, manifest: Manifest) {
      entity.manifest = manifest
    },
  }),

  render(entity: ModelEntity) {
    if (!entity.manifest) return null
    const { classifier, evaluation, review_threshold } = entity.manifest
    return Tooltip.render({
      position: "bottom",
      content: `Trained ${classifier.trained_on} · accuracy ${formatPercent(evaluation.accuracy, 1)} · review below ${review_threshold}`,
      children: Chip.render({
        children: `model v${classifier.version}`,
        size: "sm",
      }),
    })
  },
}
