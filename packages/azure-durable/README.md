# @opencraw/azure-durable

[OpenCraw](../../README.md) over HTTP, on Azure Durable Functions. One deployed Function App holds the browser,
the captcha readers and the proxies; every crawler calls it with recipes instead of bundling Playwright itself.

```sh
npm install @opencraw/azure-durable @azure/functions durable-functions
```

Two ways in:

- **`POST /crawl`**: run recipes once. Each input recipe runs in its own activity; the result comes back in the
  Durable status response, with a link to Blob storage for the large ones.
- **`POST /jobs/{crawlId}/items`**: send one item at a time to a warm worker pool. The pool keeps its windows
  between items (steps marked `keep` are skipped on a window that already did them), grows while the caller keeps
  enough items in flight, and lets idle windows go. Thousands of per-item calls cost one page load per window,
  not one per item.

## Register it

In the Function App's entry module (Functions v4 programming model), call `registerOpenCraw` once:

```ts
// src/index.ts
import { blobResults, memoryRecipes, registerOpenCraw } from '@opencraw/azure-durable'
import { tesseractReader } from '@opencraw/captcha-tesseract'
import report from '../recipes/report.json'
import row from '../recipes/row.output.json'

registerOpenCraw({
  allowedHosts:   ['*.example.gov'],                    // the only hosts recipes may reach
  recipes:        memoryRecipes([{ name: 'report', version: '3', recipes: [row, report] }]),
  results:        blobResults({ connectionString: process.env.AzureWebJobsStorage ?? '' }),
  captchaSolvers: () => [tesseractReader({ charset: '1-9A-HJ-NP-Zabdefghnqrtu' })],
  pools:          { maxWindows: 8, idleTtlMs: 600_000 },
})
```

Everything that is code or a secret stays in the host: hooks, captcha solvers, access profiles (credentials as
`{{env.NAME}}`), named recipes. Callers send data and names, never code or credentials.

| Option | What it does |
|---|---|
| `allowedHosts` | The hosts recipes may reach (`example.com`, `*.example.com`, `host:port`, `*`), enforced on every request, redirect and web socket. A function `(caller) => hosts` decides per caller; a caller it returns nothing for gets 403. |
| `identify` | Who is calling, from the request: an Entra ID principal (`x-ms-client-principal-name`, set by App Service authentication), or a header your gateway sets. Trust only headers callers cannot set themselves. |
| `recipes` | Named, versioned recipe sets: `memoryRecipes([...])` (what the deployment ships), `blobRecipes({ connectionString, shipped })` (those plus versions published over MCP, kept in Blob storage), or your own `RecipeStore`. A draft is refused by production routes. |
| `mcp`, `canPromote` | The recipe-authoring MCP endpoint, `/mcp` (off by default; `true` or `{ sampleRecords, sampleMs }`), and who may promote a draft (default: nobody). |
| `results`, `inlineLimitBytes` | Where results larger than the limit (default 256 KiB) go: `blobResults({ connectionString })` returns read-only links that expire. Without a store, everything is inline. |
| `hooks`, `captchaSolvers`, `access`, `accessPlugins`, `browser` | As in `createCrawler`. `captchaSolvers` is a factory: each crawler gets its own set. |
| `pools` | `windows` (the default policy), `maxWindows` (the cap per pool, default 8), `idleTtlMs` (a pool with no item this long closes, default 10 minutes). |
| `authLevel`, `routePrefix` | Default `function` (a function key) and no prefix. |

## Call it

### Once

```http
POST /api/crawl
{ "output": { ...output recipe... }, "inputs": [ { ...input recipe... } ], "options": { "dedupe": "recipe" } }
```

or `{ "recipe": { "name": "report", "version": "3" } }` for a stored set. Recipes that don't load return 400 with
every issue and its JSON path, before anything is queued. Otherwise the answer is Durable's 202 with its status
URLs. While it runs, `customStatus` is `{ recipes, recipesDone, records }`; when it is done, `output` is:

```json
{ "recipes": [ { "recipeId": "report", "emitted": 120, "pages": 3, "durationMs": 5400 } ],
  "records": [ { "key": "...", "data": { ... } } ],
  "results": [ "https://<account>.blob.core.windows.net/opencraw-results/<instance>/0.jsonl?<sas>" ] }
```

### One item at a time

```http
POST /api/jobs/delhi-2026-01/items
{ "recipe": { "name": "report", "version": "3" },
  "item": { "id": "DL-53-Bus", "vars": { "state": "DL", "rto": "53", "group": "Bus" } },
  "jobSize": 1200,
  "windows": { "min": 1, "max": 6, "grow": { "after": 5 }, "idle": { "afterMs": 60000 } } }
```

The first item for a crawl id opens its pool; `jobSize` and `windows` count only then. The Durable instance id is
the crawl id and item id, so the same item sent again while it runs returns the running instance's status: it
runs once. When done, `output` is:

```json
{ "outcome": "success", "report": { ... }, "records": [ ... ],
  "pool": { "windows": 4, "idle": 1, "queued": 0, "running": 3, "ended": { "success": 311, "failure": 2, "neutral": 5 } } }
```

- **Keep enough items in flight.** A pool can only keep as many windows busy as the caller keeps items in
  flight. Send more while `pool.idle` is 0 and the pool is below its maximum.
- **`neutral` means send it again.** A captcha that beat the reader, or a browser that died, says nothing about
  the item, which is not retried by the host: resubmitting is the caller's decision.
- **`refused`** means the pool would not take the item: the crawl id runs another recipe version, or the version
  is a draft or missing. The starter already answers 409 or 404 in those cases when it can tell.
- `GET /api/jobs/{crawlId}` returns the pool's state; `DELETE` closes it once its queued items finish.

## Write recipes over MCP

With `mcp: true`, `/api/mcp` serves an MCP server (Streamable HTTP, stateless) for an agent writing recipes. It
runs where the recipes will run: same browser, same outbound IP, same proxies, hooks and captcha readers. So a
recipe that works while you write it works in production too. Add the URL as a connector in your MCP client; there
is nothing to install.

| Tool | What it does |
|---|---|
| `probe` | Fetches a page from the host and reports where its data lives. Only the caller's allowed hosts. |
| `validate` | Loads and binds inline recipes: every issue with its JSON path. |
| `run` | A sample by default (`sampleRecords` per input recipe, within `sampleMs`), returned inline. With `full: true`, a complete crawl in the background. |
| `status` | A full run's state and result, for the caller who started it only. |
| `list_recipes`, `get_recipes` | The stored sets, drafts included: where to start a new version from. |
| `publish` | Saves recipes that load as a new version, as a **draft**. A version, once published, never changes. |

No tool takes a file path: recipes travel inline, and nothing on the host's disk can be read. Production (`/crawl`
by name, `/jobs`) refuses a draft until someone `canPromote` allows calls
`POST /api/recipes/{name}/{version}/promote`. So an agent publishes, and a person decides what runs.

The endpoint refuses to start without authentication: keep `authLevel: 'function'`, or put the app behind App
Service authentication and set `identify`.

## Deploy it

See [docs/recipes/azure-durable.md](../../docs/recipes/azure-durable.md): the Dockerfile, `host.json`, the plan,
and the rules a warm pool needs (one instance per singleton job, enough activity slots).
