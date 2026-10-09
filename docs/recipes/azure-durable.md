<p align="center">
  <img src="../assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# Running OpenCraw as an Azure Durable Functions app

`@opencraw/azure-durable` turns a Function App into an OpenCraw service: callers send recipes (or the name of a
stored set) over HTTP and read the result from the Durable status response. This page covers deploying it. The
API itself is in the [package README](../../packages/azure-durable/README.md).

Think of it as a central kitchen. Every crawler used to own its ovens: Playwright, Chromium, the captcha reader,
the proxies. Now they send orders to one kitchen that keeps its ovens hot, and pick up the dish.

## 1. The app

```text
my-crawler-host/
  host.json
  package.json          "main": "dist/index.js", dependencies: @opencraw/azure-durable, @azure/functions, durable-functions
  src/index.ts          registerOpenCraw({ ... })
  recipes/              the named recipe sets it serves
  Dockerfile
```

`src/index.ts` is the whole app: see [Register it](../../packages/azure-durable/README.md#register-it).

## 2. `host.json`

```json
{
  "version": "2.0",
  "functionTimeout": "-1",
  "extensions": {
    "durableTask": {
      "maxConcurrentActivityFunctions": 12,
      "maxConcurrentOrchestratorFunctions": 50,
      "overridableExistingInstanceStates": "NonRunningStates"
    }
  }
}
```

- **`maxConcurrentActivityFunctions`**: at least the pools' `maxWindows` plus two. An item waiting in a pool
  holds an activity slot, so with fewer slots than windows a pool can never fill. The host warns at startup when
  it sees fewer.
- **`overridableExistingInstanceStates: NonRunningStates`**: an item id can run again once it has finished (a
  `neutral` item sent back), and the starter answers a second start while it runs with that instance's status, so the item runs once.
- **`functionTimeout: -1`**: activities run as long as a crawl needs. The Consumption plan caps them at 10
  minutes and can't run Chromium anyway.

## 3. The container

[`apps/azure-host`](../../apps/azure-host/README.md) is a complete app built this way. Its
[Dockerfile](../../apps/azure-host/Dockerfile) installs the pruned build (`npx nx run @opencraw/azure-host:prune`:
the app's own `package.json`, lockfile and the workspace packages it uses) on the Functions Node 24 image, then
Chromium:

```dockerfile
FROM mcr.microsoft.com/azure-functions/node:4-node24
ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /home/site/wwwroot
COPY dist/package.json dist/package-lock.json ./
COPY dist/workspace_modules ./workspace_modules
RUN npm ci --omit=dev --ignore-scripts && npx playwright install --with-deps chromium
COPY host.json ./
COPY dist/*.js ./dist/
COPY dist/functions ./dist/functions
COPY dist/assets ./dist/assets
```

The build happens before the image, so the image needs no compiler. Run it on an **Elastic Premium** or
**App Service** plan (Linux, custom container). Chromium needs about 150 to 300 MB per window: size the plan for
`maxWindows` windows plus the host.

## 4. Scale: one pool per instance

A warm pool lives in one process's memory. Azure sends each activity to whichever instance is free, so a
Function App scaled to three instances has up to three pools for the same crawl id. Each is warm and adapts on
its own, but together they run three times the windows, and three times the traffic from the same outbound IPs.

For a job that must be a singleton (a site that blocks an IP that asks too much), pin the app to one instance:
`functionAppScaleLimit: 1` on Premium, or a fixed single instance on App Service. Scale up (a bigger instance),
not out. The per-site `throttle` is per process too, for the same reason.

## 5. Security

- **Authentication.** Routes need a function key by default (`authLevel: 'function'`). For per-team access, turn
  on App Service authentication (Entra ID) and use `identify: request =>
  request.headers.get('x-ms-client-principal-name') ?? undefined`. That header is trustworthy only because App
  Service authentication sets it and strips any a client sends. Without it, anyone can send that header.
- **Allowed hosts.** The host fetches whatever a recipe points at, so without a limit it is a way into your
  network. `allowedHosts` is enforced on every request, redirect and web socket, and `file:` is always refused.
  The check is by host name: also run the app where it can't reach anything it shouldn't (a VNet with no route
  to internal services).
- **Code stays in the host.** Hooks, captcha solvers and access profiles are registered in `registerOpenCraw`.
  A caller can only use them by name.

## 6. Writing recipes on the host

With `mcp: true`, the host also serves `/api/mcp`: probe, validate, sample runs, full runs and `publish`, over MCP.
Recipes written there are written where they will run. A recipe that works in the MCP session works in
production, because it is the same IP, proxies and browser.

Keep published versions in Blob storage so they survive restarts:

```ts
registerOpenCraw({
  // ...
  recipes:    blobRecipes({ connectionString: process.env.AzureWebJobsStorage ?? '', shipped: [/* the sets in the repo */] }),
  mcp:        { sampleRecords: 20, sampleMs: 60_000 },
  identify:   request => request.headers.get('x-ms-client-principal-name') ?? undefined,
  canPromote: caller => caller === 'lead@example.com',
})
```

`publish` stores a draft, which production refuses. Someone whom `canPromote` allows then promotes it with
`POST /api/recipes/{name}/{version}/promote`. A version never changes once written; the next change is the next
version. A pool running version 3 keeps running it until it closes.

## 7. A caller that keeps the pool busy

```ts
const inFlight = new Set<Promise<void>>()
let wanted = 2
for (const item of items) {
  while (inFlight.size >= wanted) await Promise.race(inFlight)
  const task = (async () => {
    const started = await fetch(`${host}/api/jobs/${crawlId}/items?code=${key}`, { method: 'POST', body: JSON.stringify({ recipe, item, jobSize: items.length }) })
    const { statusQueryGetUri } = await started.json()
    const result = await poll(statusQueryGetUri)             // until runtimeStatus is Completed or Failed
    const { output } = result
    if (output.outcome === 'neutral') items.push(item)       // send it back later
    // One more in flight while windows sit idle, up to the pool's maximum.
    wanted = Math.max(1, output.pool.windows + (output.pool.idle === 0 ? 1 : 0))
    await save(item, output)
  })()
  inFlight.add(task)
  void task.finally(() => inFlight.delete(task))
}
await Promise.all(inFlight)
```

The pool grows only while every window is busy, and lets a window go once it has waited `windows.idle.afterMs`.
So a caller that keeps one more item in flight than the pool has windows lets it grow, and a caller that slows
down lets it shrink.

## 8. Hooks that take a while

A hook behind a service (`httpHook`, or a `commandHook` that starts a job) can answer `pending`. Without
`callouts`, the activity asks again until the service settles (`maxWaitMs` on the hook, 120 s by default),
which holds the activity for that long. With `callouts` the run does not wait inside the activity:

```ts
registerOpenCraw({
  allowedHosts: ['example.com'],
  hooks:        { price: httpHook('price', 'https://rates.example.com/price', { tokenEnv: 'RATES_TOKEN' }) },
  callouts:     { signingKeyEnv: 'OPENCRAW_CALLOUT_KEY', waitMs: 2 * 60 * 60 * 1000 },
})
```

- The request to the service carries `callback: { "url": "https://app/api/callouts/<token>/resolve" }`. The
  service answers `{ "status": "pending" }` and, when it is done, posts `{ "status": "ok", "output": … }` (or
  `{ "status": "error", "error": "…" }`) to that URL. The shapes are `callout-request.schema.json` and
  `callout-resolution.schema.json` in `@opencraw/core`.
- The recipe stops, and the orchestration waits for that result with a durable timer beside it. When the
  result is posted, the recipe **runs again from the start**, and the call that was waiting returns the result
  without being made: steps before it run twice, so this suits fetch and extract steps, and a service must
  answer a repeat of a call (same `idempotencyKey`) with what it already has.
- A recipe whose result does not arrive within `waitMs` (default 1 hour) fails with the handler named; the
  other recipes of the job are not affected. A recipe is resumed at most 25 times.
- **The token is the credential.** The resolve route is registered with `authLevel: 'anonymous'` because the
  services that post back hold no function key. The token is an HMAC (with the key in `signingKeyEnv`) of the
  job, the recipe and the call, with an expiry, so a token settles that one call and nothing else, and a
  second post finds the job no longer waiting and gets 410. Keep the key in the Function App settings, like the
  other secrets; rotating it refuses the tokens in flight.
- `publicUrl` is where services post to (`https://app.example.com/api`). Left out, it is the start URL of the
  job without `/crawl`: set it behind a proxy or a custom domain.
- Only `POST /crawl` takes it. Jobs started through `/mcp` and items sent to `/jobs` poll a pending hook, as without `callouts`.
