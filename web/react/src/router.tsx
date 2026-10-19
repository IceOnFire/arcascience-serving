import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"

import { api } from "./api/client"
import { Layout } from "./Layout"
import { ClassifyPage } from "./pages/ClassifyPage"
import { MonitoringPage } from "./pages/MonitoringPage"

// Code-based routes: two pages don't need file-based routing and its Vite plugin.
// Paths use the History API, like Inglorious Web's router: / and /monitoring.
const rootRoute = createRootRoute({
  component: Layout,
  // The model manifest, for the app bar. The pages work without it, so a failure
  // only hides the version chip.
  loader: () => api.model().catch(() => undefined),
})

const classifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ClassifyPage,
})

const monitoringRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/monitoring",
  component: MonitoringPage,
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([classifyRoute, monitoringRoute]),
})

// Makes links and hooks type-safe: <Link to="/monitorin"> is a type error
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
