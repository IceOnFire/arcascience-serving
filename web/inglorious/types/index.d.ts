import "./vite-end"

import type { ChartEntity } from "@inglorious/charts"
import type { BaseEntity, EntitiesState, EntityType } from "@inglorious/store"
import type { Api } from "@inglorious/web"
import type { RouterEntity } from "@inglorious/web/router"

import type {
  Manifest,
  Prediction,
  PredictResponse,
  Stats,
} from "../src/api/client"

export interface AppRouterEntity extends RouterEntity {
  type: "Router"
}

/** The model manifest, for the app bar */
export interface ModelEntity extends BaseEntity {
  type: "Model"
  manifest?: Manifest
}

export interface ClassifyResult {
  text: string
  prediction: Prediction
}

export interface ClassifyEntity extends BaseEntity {
  type: "Classify"
  input: string
  results: ClassifyResult[]
  isLoading?: boolean
  error?: string
}

export interface MonitoringEntity extends BaseEntity {
  type: "Monitoring"
  stats?: Stats
  error?: string
  updatedAt?: number
  /** The refresh interval while the page is shown */
  timerId?: number
}

export interface NotFoundEntity extends BaseEntity {
  type: "NotFound"
}

/** A chart's own state (its tooltip); the data comes with each render */
export interface BarChartEntity extends ChartEntity {
  type: "Bar"
}

export type AppEntity =
  | AppRouterEntity
  | ModelEntity
  | ClassifyEntity
  | MonitoringEntity
  | NotFoundEntity
  | BarChartEntity

export interface AppState extends EntitiesState<AppEntity> {
  router: AppRouterEntity
  model: ModelEntity
  classify: ClassifyEntity
  monitoring: MonitoringEntity
  notFound: NotFoundEntity
  categoryChart: BarChartEntity
  confidenceChart: BarChartEntity
}

export type AppApi = Api<AppEntity, AppState>

// A type's handlers, checked against its entity and the app's api. The app's types use
// this shorthand rather than a `type` alias listing each event: handleAsync adds five
// events per request (predict, predictStart, predictRun, predictSuccess, ...), which an
// alias would have to repeat.
export type AppType<TEntity extends AppEntity> = EntityType<TEntity, AppApi>

/** What the predict request resolves to: the texts sent, with their predictions */
export interface PredictOutcome extends PredictResponse {
  texts: string[]
}
