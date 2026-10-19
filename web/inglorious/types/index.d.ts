import "./vite-end"

import type { BaseEntity, EntitiesState } from "@inglorious/store"
import type { Api, TemplateResult } from "@inglorious/web"
import type { RouterEntity } from "@inglorious/web/router"

import type {
  Manifest,
  Prediction,
  PredictResponse,
  Stats,
} from "../src/api/client"

export interface AppRouterEntity extends BaseEntity, Omit<RouterEntity, "id"> {
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
export interface ChartEntity extends BaseEntity {
  type: "Bar"
}

export type AppEntity =
  | AppRouterEntity
  | ModelEntity
  | ClassifyEntity
  | MonitoringEntity
  | NotFoundEntity
  | ChartEntity

export interface AppState extends EntitiesState<AppEntity> {
  router: AppRouterEntity
  model: ModelEntity
  classify: ClassifyEntity
  monitoring: MonitoringEntity
  notFound: NotFoundEntity
  categoryChart: ChartEntity
  confidenceChart: ChartEntity
}

export type AppApi = Api<AppEntity, AppState>

export type Render<E> = (entity: E, api: AppApi) => TemplateResult | null

/** What the predict request resolves to: the texts sent, with their predictions */
export interface PredictOutcome extends PredictResponse {
  texts: string[]
}
