import "@inglorious/ui/base.css"
import "@inglorious/ui/themes/material.css"
import "@inglorious/ui/app-bar.css"
import "@inglorious/ui/container.css"
import "@inglorious/ui/tabs.css"
import "@inglorious/ui/card.css"
import "@inglorious/ui/grid.css"
import "@inglorious/ui/chip.css"
import "@inglorious/ui/table.css"
import "@inglorious/ui/textarea.css"
import "@inglorious/ui/button.css"
import "@inglorious/ui/progress.css"
import "@inglorious/ui/alert.css"
import "@inglorious/ui/tooltip.css"
import "@inglorious/ui/typography.css"
import "@inglorious/charts/base.css"
import "@inglorious/charts/theme.css"
import "./app.css"

import { mount } from "@inglorious/web"

import { App } from "./app"
import { store } from "./store"

// Light or dark following the system, like the React app. The theme is a class on the
// body, so it follows the media query here rather than in CSS.
const dark = window.matchMedia("(prefers-color-scheme: dark)")
const applyScheme = () => {
  document.body.classList.toggle("iw-theme-dark", dark.matches)
  document.body.classList.toggle("iw-theme-light", !dark.matches)
}
applyScheme()
dark.addEventListener("change", applyScheme)

mount(store, (api) => App.render(null, api), document.getElementById("root")!)
