# OpenCraw host for Azure

A complete Azure Functions app that serves [OpenCraw](../../README.md) over HTTP with
[`@opencraw/azure-durable`](../../packages/azure-durable/README.md). Build it, run it locally, deploy it, call it.

One Function App gives every crawler you have:

| Route | What it does |
|---|---|
| `POST /api/crawl` | Runs a recipe set once: inline recipes, or a stored set by name. Durable returns a status URL; the result is in its `output`. |
| `POST /api/jobs/{crawlId}/items` | Sends one item to a warm worker pool. Windows stay open between items, so thousands of calls cost one page load per window. |
| `GET` / `DELETE /api/jobs/{crawlId}` | Reads a pool's state, or closes it. |
| `POST /api/recipes/{name}/{version}/promote` | Makes a draft published over MCP runnable in production. |
| `/api/mcp` | The recipe-authoring MCP endpoint: probe, validate, sample runs, full runs, publish. Recipes are written where they will run. |

It ships two recipe sets for [books.toscrape.com](https://books.toscrape.com), a site built for scraping practice, so
everything works the moment it is deployed:

| Set | What it crawls | Good for |
|---|---|---|
| `books-by-category` v1 | One category's books (`vars.category`, e.g. `mystery_3`), every page | `/jobs`: one item per category |
| `catalogue` v1 | All 1,000 books, 50 pages | `/crawl`: a result too large to return inline, so it comes back as a Blob link |

## What is inside

```text
apps/azure-host/
  src/
    main.ts                    imports each function file (esbuild follows these imports)
    functions/opencraw.ts      registerOpenCraw(...): every route above
    host-settings.ts           app settings → host options (hosts, auth, storage, pools, MCP)
    book-hooks.ts              the hooks the recipes call (stars, decodeHtml)
    shipped-recipes.ts         the recipe sets the deployment ships, by name and version
    assets/recipes/            the recipes themselves (JSON)
  host.json                    Durable settings the pools need
  Dockerfile                   Functions runtime + Node 22 + Chromium
  deploy/deploy.sh             every Azure resource, with the Azure CLI
  local.settings.example.json  the settings for `func start`
```

## 1. Build

From the repository root:

```sh
npm ci
npx nx run @opencraw/azure-host:prune
```

`prune` builds the app into `dist/`, then writes a `package.json` and a lockfile for it alone and copies the
workspace packages it uses into `dist/workspace_modules`. `dist/` then installs on its own, which is what the
container does.

## 2. Run it locally

You need Docker and [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (it is a dev
dependency of this repository). Durable Functions keeps its task hub in storage, so Azurite has to run first:

```sh
npx azurite --inMemoryPersistence --silent --skipApiVersionCheck &

docker build -t opencraw-host apps/azure-host

# Local function keys: the runtime reads them from this file.
mkdir -p /tmp/opencraw-keys && cat > /tmp/opencraw-keys/host.json <<'KEYS'
{ "masterKey": { "name": "master", "value": "local-key", "encrypted": false },
  "functionKeys": [ { "name": "default", "value": "local-key", "encrypted": false } ], "systemKeys": [] }
KEYS

docker run --rm --network host \
  -e WEBSITE_HOSTNAME=localhost:80 \
  -e AzureWebJobsStorage=UseDevelopmentStorage=true \
  -e AzureWebJobsSecretStorageType=files \
  -v /tmp/opencraw-keys:/azure-functions-host/Secrets \
  opencraw-host
```

`WEBSITE_HOSTNAME` is the address Durable writes into its status URLs; Azure sets it for you, a local
container does not. `--network host` lets the container reach Azurite on `127.0.0.1`. Docker Desktop (macOS, Windows) has no
host network: publish the port (`-p 8080:80`) and give `AzureWebJobsStorage` a full Azurite connection string
whose endpoints use `host.docker.internal`.

## 3. Deploy it

Log in (`az login`), pick a short unique name, and run:

```sh
npx nx run @opencraw/azure-host:prune
OPENCRAW_NAME=mycrawler OPENCRAW_LOCATION=westeurope apps/azure-host/deploy/deploy.sh
```

It creates, in `rg-mycrawler`:

| Resource | Why |
|---|---|
| Storage account | Durable's task hub, published recipes, large results (read links signed with its key) |
| Container registry | The image, built in Azure (`az acr build`: no local Docker needed) |
| Elastic Premium plan (EP1, Linux) | Containers and Chromium; no time limit on an activity. One always-ready instance. |
| Function App | The container, pulled with its managed identity; `functionAppScaleLimit` 1 |

Running the script again builds a new image and rolls it out. The plan has one always-ready instance, so it
costs money while it exists: `az group delete --name rg-mycrawler` removes everything.

**Why one instance.** A warm pool lives in one process's memory. With two instances, a crawl id could have a
pool on each: twice the windows, and twice the traffic to the site from the same IPs. For more capacity, scale
up (`EP2`, `EP3`) and raise `OPENCRAW_MAX_WINDOWS` and `maxConcurrentActivityFunctions` in `host.json`
together.

## 4. Call it

The function key goes in the `x-functions-key` header (or `?code=`):

```sh
KEY=$(az functionapp keys list --name func-mycrawler --resource-group rg-mycrawler --query functionKeys.default -o tsv)
HOST=https://func-mycrawler.azurewebsites.net
```

**Once.** Start a crawl, then follow `statusQueryGetUri` until `runtimeStatus` is `Completed`:

```sh
curl -s -X POST "$HOST/api/crawl" -H "x-functions-key: $KEY" -H 'content-type: application/json' \
  -d '{"recipe":{"name":"books-by-category","version":"1"}}'
# → 202 { "id": "…", "statusQueryGetUri": "…", … }

curl -s "<statusQueryGetUri>"
# → { "runtimeStatus": "Completed", "customStatus": { "recipes": 1, "recipesDone": 1, "records": 11 },
#     "output": { "recipes": [ … ], "records": [ { "data": { "title": "It's Only the Himalayas", "price": 45.17, … } } ], "results": [] } }
```

The `catalogue` set returns its 1,000 records as a link instead (`output.results`), valid for 24 hours. Inline
recipes work too: `{ "output": { … }, "inputs": [ { … } ] }`, limited to the hosts in `OPENCRAW_ALLOWED_HOSTS`.

**One item at a time.** Every item is its own call; the pool keeps its windows between them:

```sh
for category in travel_2 mystery_3 historical-fiction_4 classics_6; do
  curl -s -X POST "$HOST/api/jobs/demo/items" -H "x-functions-key: $KEY" -H 'content-type: application/json' \
    -d "{\"recipe\":{\"name\":\"books-by-category\",\"version\":\"1\"},\"item\":{\"id\":\"$category\",\"vars\":{\"category\":\"$category\"}},\"jobSize\":4}"
done
```

Each answer is Durable's 202; each item's `output` holds `outcome`, its `records` and `pool`
(`windows`, `idle`, `queued`, `running`). Keep more items in flight while `pool.idle` is 0 and the pool will grow;
send an item back when its outcome is `neutral`. The same item id sent again while it runs returns the running
instance. `GET /api/jobs/demo` shows the pool; `DELETE` closes it.

**Write recipes over MCP.** Add `https://func-mycrawler.azurewebsites.net/api/mcp?code=<key>` as a remote MCP
server (Streamable HTTP) in your MCP client. The agent can `probe` a page from the host, `validate` recipes,
`run` a sample, `publish` a draft. Someone listed in `OPENCRAW_PROMOTERS` promotes it:

```sh
curl -X POST "$HOST/api/recipes/my-recipes/1/promote" -H "x-functions-key: $KEY"   # with Entra ID: the promoter's token
```

## 5. Settings

| App setting | Default | What it does |
|---|---|---|
| `OPENCRAW_ALLOWED_HOSTS` | `books.toscrape.com` | The only hosts recipes may reach, comma-separated (`example.com`, `*.example.com`, `host:port`). Every request, redirect and web socket is checked. |
| `OPENCRAW_MCP` | `true` | The `/api/mcp` endpoint. |
| `OPENCRAW_PROMOTERS` | none | Who may promote drafts: Entra ID principal names, comma-separated. Needs App Service authentication. |
| `OPENCRAW_MAX_WINDOWS` | `4` | The most browser windows one pool runs. Keep `maxConcurrentActivityFunctions` in `host.json` at least 2 above it. |
| `OPENCRAW_POOL_IDLE_MINUTES` | `10` | A pool with no item this long closes its browser. |
| `OPENCRAW_ACCESS` | direct | An [access config](../../docs/recipes/access.md) as JSON: proxy profiles, the default, per-site throttle. Put credentials in other app settings and refer to them as `{{env.NAME}}`. |
| `OPENCRAW_STORAGE` | `AzureWebJobsStorage` | Where published recipes and large results go. It needs an account key (it signs the result links); with an identity-based connection, published recipes stay in memory and every result is inline. |

## 6. Make it yours

- **Recipes.** Add files to `src/assets/recipes/` and a line to `shipped-recipes.ts`. A changed recipe is a new
  version: a pool running version 1 keeps running it until it closes.
- **Hosts.** Add the sites to `OPENCRAW_ALLOWED_HOSTS`. Nothing outside the list is reachable.
- **Hooks.** Add them to `book-hooks.ts` (or a file of your own) and to `hooks` in `host-settings.ts`. Recipes
  call them by name; callers can never send code.
- **Captchas.** `tesseractReader()` is registered already: name it in a recipe's `captcha` step. Set `charset`
  and `length` for the site ([captcha-tesseract](../../packages/captcha-tesseract/README.md)).
- **Callers.** Turn on App Service authentication (the app's *Authentication* page: add the Microsoft
  identity provider, require authentication). App Service then sets `WEBSITE_AUTH_ENABLED`, and the host tells
  callers apart by their principal: each gets its own pools, and `OPENCRAW_PROMOTERS` can name people.
  Without it, the function key is the only lock.

**Outside this repository.** In your own [mnci](https://www.npmjs.com/package/@mnci/cli) workspace, run
`npx @mnci/cli add node-function-app <name>`, copy `src/`, `host.json`, `Dockerfile`, `.dockerignore` and
`deploy/` over, and add the dependencies from this `package.json` (they resolve from npm there).

## What was verified, and how

- The unit tests (`nx run @opencraw/azure-host:test`): settings, hooks, and that every shipped set loads and binds.
- The image was built with this Dockerfile and run with the Functions runtime against Azurite. The runtime
  registered all nine functions, then:
  - `/crawl` returned the live category (11 books), and the catalogue as a 1,000-line Blob link;
  - six `/jobs` items (174 books) ran on a pool that grew to two windows;
  - a duplicate item id returned the running instance, and an unknown version got a 404;
  - `/mcp` initialised and listed its seven tools, `probe` reached the site and refused a host outside the
    list, and a sample run returned 20 records.
- `deploy/deploy.sh`: every command and flag checked against Azure CLI 2.90's help. It has not been run
  against a subscription from this repository's CI.
