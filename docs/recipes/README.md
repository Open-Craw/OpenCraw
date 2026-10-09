<p align="center">
  <img src="../assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# Recipe documentation

| Document | Read it when |
|---|---|
| [authoring.md](./authoring.md) | You are writing a recipe and need every field, step, transform and rule, with the reasoning behind each. The reference. |
| [quick-guide.md](./quick-guide.md) | You want the short version: one page, the common shapes. |
| [programmatic-authoring.md](./programmatic-authoring.md) | You generate many similar recipes (per shop, region or login) and want to build them as objects in code instead of typing JSON. |
| [How OpenCraw works](../how-it-works/README.md) | You want to see what the engine does with each part of a recipe: every step, template, transform and policy run on real sites, APIs and documents, with screenshots, traces and the records they gave, and the engineering of the PDF, spreadsheet, PowerPoint and Word readers. |
| [examples/](../../examples/README.md) | You want recipes that run: every example, what it shows and how to start it. |
| [examples/movies](../../examples/movies/README.md), [examples/filmography](../../examples/filmography/README.md) | You want to see real recipes end to end: five movies from Netflix and IMDb, then movie → lead actor → filmography on TMDB and Letterboxd, with the decisions, the traces and the bugs met on the way. |
| [examples/vehicles](../../examples/vehicles/README.md) | You want the harder case: configurator data behind an inline `carPath`, three pages per model, nested loops emitting one record per priced combination, and the two engine features it forced (`regex` extracts, templated selectors). |
| [access.md](./access.md) | A site blocks the network you crawl from: proxies, provider presets, where credentials go, and the plugin seam. |
| [worker-mode.md](./worker-mode.md) | You crawl thousands of items (one report per date, region and filter set) from a queue: windows that stay busy, keep their page between items, and grow or shrink with the site's health. |
| [azure-durable.md](./azure-durable.md) | You want one OpenCraw service every crawler calls over HTTP: the Azure Durable Functions host, its container, `host.json`, scaling, security, and a caller that keeps a warm pool busy. |
| [captcha.md](./captcha.md) | A site shows a captcha: whether to solve it, the four places a challenge appears, the solve loop, the budget, and writing a solver. |
| [../requirements.md](../requirements.md) | You need the specification the engine is checked against. |

The JSON Schemas for editor validation are in `packages/core/schemas/`; point a recipe's (or an access config's) `$schema` at them.
