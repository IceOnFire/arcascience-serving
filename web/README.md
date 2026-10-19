# Web apps

A small web interface for the [API](../api/README.md): classify endpoints, and watch the monitoring data move. It is built twice, with the same features, to compare two ways of making it:

| App                                   | Stack                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`react/`](react/README.md)           | React 19, TypeScript, Material UI, Recharts, TanStack Router, Vite                                                                                        |
| [`inglorious/`](inglorious/README.md) | [Inglorious Web](https://github.com/IngloriousCoderz/inglorious-forge) with lit-html, TypeScript, Inglorious UI (material theme), Inglorious Charts, Vite |

Inglorious Web is my own framework. The React stack was chosen so the comparison is about the frameworks, not about different designs: Inglorious UI's components follow Material UI's (app bar, cards, chips, tables) and it ships a material theme, and Inglorious Charts is modelled on Recharts.

## What both apps share

- **Features.** A _Classify_ page (endpoints in, a table of categories, confidence and review flags out) and a _Monitoring_ page (the API's [`/stats`](../api/README.md#drift-statistics-stats): window, review rate, drift verdicts, and live vs baseline charts, refreshed every 5 seconds).
- **The API contract.** Both generate their TypeScript types from [`api/openapi.json`](../api/openapi.json), so a response that changes shape is a type error in both.
- **No API key in the browser.** In development, the Vite server forwards `/api/*` to the API and adds the `X-API-Key` header itself, reading it from `api/.env`. The key never reaches the JavaScript bundle; I checked the built React bundle for it. In production, a small backend-for-frontend would do the same.
- **Charts within a common subset.** Only what both chart libraries have: bars, axes, grid, tooltip, legend, and no animation. That's also why the bars are vertical: Inglorious Charts has no horizontal layout.
- **Logic outside the components.** The API client and the functions that turn `/stats` into chart rows and labels are plain TypeScript, with unit tests. Each app has its own copy, and the copies are identical (`src/api/client.ts`, `src/lib/stats.ts`), so the apps differ only in framework code.

## How they compare

Measured on 2026-10-19, production builds, same features:

|                                   | React                                  | Inglorious Web                                               |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| JavaScript + CSS shipped, gzipped | 291 kB                                 | 49 kB (44 kB JS, 5.5 kB CSS)                                 |
| Framework-specific code           | 516 lines                              | 582 lines, of which 80 of CSS                                |
| Where state lives                 | Components (`useState`), router loader | Store entities, changed by event handlers                    |
| Reactivity                        | Re-render components on state change   | Re-render the whole tree; lit-html updates only what changed |

The Inglorious bundle is about 6 times smaller. The amount of code is about the same: what React writes as Material UI `sx` props, the Inglorious app writes as CSS, part of it working around library issues listed in its [README](inglorious/README.md#notes). The [Inglorious README](inglorious/README.md#same-app-two-models) maps each concern from one model to the other.

## Running

Both need the API running (see the [main README](../README.md#quick-start)) on port 8000, or set `API_URL`. Each runs on its own with `pnpm install && pnpm dev`; started together, the second takes the next free port.
