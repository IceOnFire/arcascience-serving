import { AppBar } from "@inglorious/ui/app-bar"
import { Container } from "@inglorious/ui/container"
import { Tabs } from "@inglorious/ui/tabs"
import { html } from "@inglorious/web"

import type { AppApi } from "../types"

const TABS = [
  { value: "/", label: "Classify" },
  { value: "/monitoring", label: "Monitoring" },
]

export const App = {
  render(_props: Record<string, unknown> | null, api: AppApi) {
    const router = api.getEntity("router")!
    const isTab = TABS.some((tab) => tab.value === router.path)

    return html`
      <header>
        ${AppBar.render({
          title: "Endpoint classifier",
          color: "primary",
          trailing: api.render("model"),
        })}
        <nav class="app-tabs">
          ${Tabs.render({
            items: TABS,
            // No tab selected on a page that isn't one of them (Not Found)
            value: isTab ? router.path : null,
            onChange: (path) => api.notify("#router:navigate", path),
          })}
        </nav>
      </header>
      <main>
        ${Container.render({
          maxWidth: "lg",
          children: api.render(router.route!),
        })}
      </main>
    `
  },
}
