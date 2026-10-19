import type { RoutesConfig } from "@inglorious/web/router"

// Each path names the entity its page renders.
export const routes: RoutesConfig = {
  "/": "classify",
  "/monitoring": "monitoring",
  "*": "notFound",
}
