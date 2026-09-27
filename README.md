<p align="center">
  <img src="docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# OpenCraw

A recipe-driven crawler for Node.js. The engine is generic; everything site-specific is JSON:

- an **output recipe** declares the records you want (fields, types, quality rules);
- **input recipes** declare how to get them from a site, driving a real browser (Playwright) or calling
  HTTP endpoints (Playwright's request context, so a browser login hands its cookies to the API calls);
- an **id-based mapping** binds what the steps extracted to the output fields through pure transforms,
  with programmatic hooks for what JSON cannot say.

Several input recipes can feed one output; a run processes them one after another, or `parallel` at a time.

| Package | What it is |
|---|---|
| [`@opencraw/core`](./packages/core) | The engine: recipe contracts and validation, the step walk, both runners, mapping, sinks. |
| [`@opencraw/cli`](./packages/cli) | `opencraw validate` / `run` / `probe` / `diff` — inspect a site, check a recipe, run a crawl, compare two runs from the terminal. |
| [`@opencraw/mcp`](./packages/mcp) | The same probe/validate/run/list/diff primitives as an MCP server, for an agent instead of a terminal. |
| [`@opencraw/office-reader`](./packages/office-reader) | Reads `.xlsx` workbooks, `.pptx` presentations and `.docx` documents into plain objects, in Node or a browser. Standalone: core uses it, it depends on nothing of OpenCraw. |
| [`@opencraw/captcha-tesseract`](./packages/captcha-tesseract) | Reads image captchas with Tesseract for form captchas: refreshes the image instead of submitting a doubtful read, fills the answer field, and audits every read with the site's verdict. |
| [`@opencraw/azure-durable`](./packages/azure-durable) | OpenCraw as an HTTP service on Azure Durable Functions: run recipes with one call, or send items one at a time to warm worker pools that keep their windows. Hooks, solvers and secrets stay in the host; recipes can only reach the hosts it allows. |

| App | What it is |
|---|---|
| [`apps/azure-host`](./apps/azure-host) | A complete Azure Functions app on `@opencraw/azure-durable`, ready to build, run in Docker and deploy with one script: `/crawl`, `/jobs`, `/mcp`, and two recipe sets that work the moment it is up. |

## What it reads

One recipe format covers every source below. A site, an API and a PDF price list can feed the same output, and
the records come out typed and checked alike. Documents arrive by a `request` (typed by `Content-Type`), a local
`file:` URL (typed by extension), or a browser download; `as` overrides the guess.

| Source | Reaches a recipe by | Read with | What the reader does |
|---|---|---|---|
| **Live web pages** | a real browser (Playwright): `goto`, `click`, `fill`, `select`, `scroll`, `wait` | `css`, `xpath`, `regex`, `table` | Renders JavaScript, logs in, follows postbacks and infinite scroll, and hands its cookies to API calls. [→](./docs/how-it-works/02-page-steps.md) |
| **HTML over HTTP** | `request`, no browser | `css`, `xpath`, `regex`, `table` | Fast static reads; pulls JSON out of `<script>` state and JSON-LD; HTML tables read with `rowspan`/`colspan` placed. [→](./docs/how-it-works/03-data-steps.md) |
| **JSON APIs, JSON Lines** | `request` (GET, POST, forms, cursors, pages) | `jsonpath`, `regex` | Unwraps JSONP, `)]}'` guards and `window.__STATE__ = …` assignments without running them. [→](./docs/how-it-works/06-documents.md#10-json-and-json-lines) |
| **XML, RSS, Atom, sitemaps** | `request` or `file:` (`.xml.gz` gunzipped) | `xpath`, `css`, `regex` | XPath 1.0 with namespaces, or `ignoreNamespaces`; entities never expanded, nothing external fetched. [→](./docs/how-it-works/06-documents.md#9-xml) |
| **YAML** | `request` or `file:` | `jsonpath`, `regex` | YAML 1.2 always (`NO` stays `"NO"`), merge keys, several documents; "billion laughs" files refused. [→](./docs/how-it-works/06-documents.md#8-yaml) |
| **CSV, TSV** | `request` or `file:` | `table`, `jsonpath`, `regex` | Guesses the delimiter and the encoding (BOM, charset, UTF-8, then Windows-1252 for Excel's exports). [→](./docs/how-it-works/06-documents.md#3-spreadsheets-and-csv) |
| **Excel** (`.xlsx`, `.xlsm`) | `request`, `file:` or a download | `table`, `jsonpath`, `regex` | Every sheet with merged cells, hidden sheets and rows, typed numbers, dates from number formats, and formula results as last saved. [→](./docs/how-it-works/06-documents.md#33-the-xlsx-reader) |
| **PowerPoint** (`.pptx`) | `request`, `file:` or a download | `table`, `jsonpath`, `regex` | Shapes in reading order with their positions, tables with merges, chart series from the chart's own data, and speaker notes. [→](./docs/how-it-works/06-documents.md#4-powerpoint) |
| **Word** (`.docx`) | `request`, `file:` or a download | `css`, `xpath`, `regex`, `table` | Read as HTML: headings, lists, tables, headers, footers and notes, tracked changes accepted. [→](./docs/how-it-works/06-documents.md#5-word) |
| **PDF** | `request`, `file:` or a download | `table`, `jsonpath`, `regex` | Rebuilds tables from text positions alone: cells, rows, columns and headers, wrapped cells regrouped, with no ruling lines needed. Text-layer PDFs; no OCR. [→](./docs/how-it-works/06-documents.md#2-pdf) |
| **Markdown** | `request` or `file:` | `css`, `xpath`, `regex`, `table` | GitHub-flavoured, rendered to HTML with one section per heading; front matter read as YAML. [→](./docs/how-it-works/06-documents.md#7-markdown) |
| **Plain text** | anything else | `regex`, `xpath` | The decoded text, as is. |

The document readers load on first use, so a crawl that reads only web pages never loads pdf.js or the Office
reader. Legacy binary Office files (`.xls`, `.ppt`, `.doc`), encrypted Office files and OpenDocument are refused
with a clear error.

## Quick start

```sh
npm install @opencraw/core
npx playwright install chromium     # only for web recipes and browser bootstraps
```

Or from the terminal, with [`@opencraw/cli`](./packages/cli):

```sh
npm install -g @opencraw/cli
opencraw probe https://example.com/product/1      # find where a site's data lives
opencraw validate recipes/                        # check a recipe binds before running it
opencraw run recipes/ --out out/products.jsonl
```

```ts
import { createCrawler, jsonLinesSink, loadRecipeSet } from '@opencraw/core'

const recipes = await loadRecipeSet({ output: 'recipes/product.output.json', inputs: ['recipes/'] })
const crawler = createCrawler({ sink: jsonLinesSink('out/products.jsonl') })
const report = await crawler.run(recipes)
await crawler.close()
```

Start from the [examples](./examples/README.md) (each one runs with `npm start`; [`examples/shop`](./examples/shop) runs offline) and the guide in [`docs/recipes/authoring.md`](./docs/recipes/authoring.md).
[How OpenCraw works](./docs/how-it-works/README.md) shows what the engine does with every part of a recipe, on real sites, APIs and documents.
The specification is [`docs/requirements.md`](./docs/requirements.md).

## Working on this repository

An Nx monorepo generated with [`@mnci/cli`](https://www.npmjs.com/package/@mnci/cli); every package is added
with `mnci add`. Code is organised in vertical feature slices, enforced by lint: see
[`docs/architecture/vertical-feature-slices.md`](./docs/architecture/vertical-feature-slices.md).

```sh
npm install
npm run affected            # lint, typecheck, test, build for what changed (what CI runs)
npm run core:qa             # lint + unit tests of @opencraw/core
npm run playwright:install  # once, for the browser tests
npm run core:e2e            # browser + HTTP end-to-end suite against a local fixture shop
npm run core:schemas        # regenerate packages/core/schemas from the zod contracts
npm run format              # eslint --fix; the linter is the formatter
```

Commits follow Conventional Commits (enforced by commitlint); `nx release` versions and publishes
`packages/*` from them on every push to `main`.
