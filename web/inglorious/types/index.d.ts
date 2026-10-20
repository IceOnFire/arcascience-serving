import "./vite-end"

import type { ChartEntity } from "@inglorious/charts"
import type { BaseEntity, EntitiesState } from "@inglorious/store"
import type { AsyncEvents } from "@inglorious/store/async"
import type { Api, TemplateResult } from "@inglorious/web"
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

/** What the predict request resolves to: the texts sent, with their predictions */
export interface PredictOutcome extends PredictResponse {
  texts: string[]
}

/** What the router broadcasts on every navigation */
export type RouteChange = Pick<
  RouterEntity,
  "route" | "path" | "params" | "query"
>

// Each type's events and their payloads. Declared with `type`, not `interface`, which
// doesn't fit the store's `types`. AsyncEvents lists the events handleAsync generates
// for a request (load, loadRun, loadSuccess, loadError, loadFinally, loadStart).

export type ModelType = {
  create: (entity: ModelEntity, payload: void, api: AppApi) => void
  render: (entity: ModelEntity, api: AppApi) => TemplateResult | null
} & AsyncEvents<"load", ModelEntity, void, Manifest, AppApi>

export type ClassifyType = {
  create: (entity: ClassifyEntity) => void
  inputChange: (entity: ClassifyEntity, input: string) => void
  submit: (entity: ClassifyEntity, payload: void, api: AppApi) => void
  render: (entity: ClassifyEntity, api: AppApi) => TemplateResult
} & AsyncEvents<"predict", ClassifyEntity, string[], PredictOutcome, AppApi>

export type MonitoringType = {
  routeChange: (
    entity: MonitoringEntity,
    payload: RouteChange,
    api: AppApi,
  ) => void
  render: (entity: MonitoringEntity, api: AppApi) => TemplateResult | null
} & AsyncEvents<"load", MonitoringEntity, void, Stats, AppApi>

export type NotFoundType = {
  render: (entity: NotFoundEntity, api: AppApi) => TemplateResult
}
