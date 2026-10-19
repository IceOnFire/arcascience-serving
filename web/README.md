# Web apps

A small web interface for the [API](../api/README.md): classify endpoints, and watch the monitoring data move. It is built twice, with the same features, to compare two ways of making it:

| App                         | Stack                                                                                                                                                     | Status  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| [`react/`](react/README.md) | React 19, TypeScript, Material UI, Recharts, Vite                                                                                                         | Done    |
| `inglorious/`               | [Inglorious Web](https://github.com/IngloriousCoderz/inglorious-forge) with lit-html, TypeScript, Inglorious UI (material theme), Inglorious Charts, Vite | Planned |

Inglorious Web is my own framework. The React stack was chosen so the comparison is about the frameworks, not about different designs: Inglorious UI's components follow Material UI's (app bar, cards, chips, tables) and it ships a material theme, and Inglorious Charts is modelled on Recharts.

## What both apps share

- **Features.** A _Classify_ page (endpoints in, a table of categories, confidence and review flags out) and a _Monitoring_ page (the API's [`/stats`](../api/README.md#drift-statistics-stats): window, review rate, drift verdicts, and live vs baseline charts, refreshed every 5 seconds).
- **The API contract.** Both generate their TypeScript types from [`api/openapi.json`](../api/openapi.json), so a response that changes shape is a type error in both.
- **No API key in the browser.** In development, the Vite server forwards `/api/*` to the API and adds the `X-API-Key` header itself, reading it from `api/.env`. The key never reaches the JavaScript bundle; I checked the built React bundle for it. In production, a small backend-for-frontend would do the same.
- **Charts within a common subset.** Only what both chart libraries have: bars, axes, grid, tooltip, legend, and no animation. That's also why the bars are vertical: Inglorious Charts has no horizontal layout.
- **Logic outside the components.** Turning `/stats` into chart rows, ticks and labels is in plain TypeScript functions ([`react/src/lib/stats.ts`](react/src/lib/stats.ts)), with unit tests, so the second app can reuse them as they are.

## Running

Both need the API running (see the [main README](../README.md#quick-start)) on port 8000, or set `API_URL`.
