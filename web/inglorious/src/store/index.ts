import { Chart } from "@inglorious/charts"
import { createStore } from "@inglorious/store"
import { Router, setRoutes } from "@inglorious/web/router"

import type { AppEntity, AppState } from "../../types"
import { Classify } from "../pages/classify"
import { Monitoring } from "../pages/monitoring"
import { NotFound } from "../pages/not-found"
import { Model } from "../types/model"
import { entities } from "./entities"
import { middlewares } from "./middlewares"
import { routes } from "./routes"

setRoutes(routes)

export const store = createStore<AppEntity, AppState>({
  types: {
    Router,
    Model,
    Classify,
    Monitoring,
    NotFound,
    Bar: Chart,
  },
  entities,
  middlewares,
  // Creates an entity for each type that has none: router, model, classify, monitoring,
  // notFound. Not for Bar, which has two entities in entities.ts.
  autoCreateEntities: true,
})
