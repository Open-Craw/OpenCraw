<p align="center">
  <img src="../assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# Running

[How OpenCraw works](README.md), part 10 of 10.

The other parts follow the steps: what a step sees, what it keeps, how a value becomes a field. This part is about
what surrounds them while a crawl runs: the run itself, the browser or HTTP session each recipe gets, the network it
goes through, what counts as a block, how fast it may go, what it retries, where it may go, how much runs at once,
and how you watch all of it.

Every trace below comes from a run against [books.toscrape.com](https://books.toscrape.com) or
[quotes.toscrape.com](https://quotes.toscrape.com), two sites built for scraping practice. Where something can't be
shown safely on a live site (captchas, proxies, a worker pool under real load), the page says so and quotes the
engine's own end-to-end tests instead, labelled as such.

**Contents**

1. [The run](#1-the-run)
2. [Sessions](#2-sessions)
3. [Access, proxies and blocks](#3-access-proxies-and-blocks)
4. [Pace and retries](#4-pace-and-retries)
5. [Captchas](#5-captchas)
6. [Allowed hosts](#6-allowed-hosts)
7. [Concurrency and worker mode](#7-concurrency-and-worker-mode)
8. [Events and the trace](#8-events-and-the-trace)

## 1. The run

### The crawler and `run`

```ts
import { createCrawler, jsonLinesSink, loadRecipeSet, traceLine } from '@opencraw/core'

const recipes = await loadRecipeSet({ output: 'recipes/book.output.json', inputs: ['recipes/'] })
const crawler = createCrawler({
  sink:    jsonLinesSink('out/books.jsonl'),
  onEvent: event => { const line = traceLine(event); if (line) console.log(line) },
})
try {
  const report = await crawler.run(recipes)
} finally {
  await crawler.close()
}
```

`createCrawler` builds what every run of this crawler shares: the sink, the hooks, the captcha solvers, the access
broker, the per-site throttle, the host allowlist and the event bus. It checks the configuration then (an access
profile that can't work, two solvers with one name, a bad host pattern, `resume` with a sink that can't answer), so a
mistake fails before any page loads. It does **not** start a browser: the first recipe or bootstrap that needs one
launches it, and every later one shares it. A browser that crashed is launched again on the next need. `close()`
closes it.

`run(set)` opens the sink once, runs the set's input recipes, closes the sink, and returns the report. A recipe that
fails doesn't throw: its failure is written into its entry of the report, and the others go on (unless
`onRecipeError: 'stop'`).

### Recipe runs: start points and variants

A **recipe run** is one input recipe with one set of vars. A recipe without a `matrix` gives one run. With a
`matrix`, it gives one run per combination, one after the other:

- an object of lists (`{ "state": ["DL", "GA"], "group": ["Bus", "Car"] }`) runs every combination, four here;
- a list of var sets runs exactly those.

Inside a run, the **start points** run in order, each from a fresh scope with `start.url`, `vars` and page 1. A run
that reaches `maxRecords` stops there, remaining start points included.

Where a var's value comes from, weakest first:

| Source | Example |
|---|---|
| the recipe's `vars` | `"vars": { "category": "Travel" }` |
| the matrix combination, or in worker mode the work item's vars | `"matrix": [{ "category": "Poetry" }]` |
| the start point's own `vars` | `"start": [{ "url": "…", "vars": { "category": "Art" } }]` |

The last row is the surprising one: a start point's vars beat the matrix and the work item.

[`category-firsts.input.json`](recipes/run-matrix/category-firsts.input.json) is an api recipe with a two-entry
matrix. Each variant requests its category's listing (`{{vars.slug}}/index.html`, relative to the start URL) and keeps
two books:

<!-- capture:run-matrix trace grep=▶|⇢|✚|■ -->
```text
▶ category-firsts [category=Travel, slug=travel_2] (api)
  ⇢ page 1  https://books.toscrape.com/catalogue/category/books/travel_2/index.html
  ✚ record ["https://books.toscrape.com/catalogue/its-only-the-himalayas_981/index.html"]
  ✚ record ["https://books.toscrape.com/catalogue/full-moon-over-noahs-ark-an-odyssey-to-mount-ararat-and-beyond_811/index.html"]
■ category-firsts [category=Travel, slug=travel_2]: 2 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
▶ category-firsts [category=Poetry, slug=poetry_23] (api)
  ⇢ page 1  https://books.toscrape.com/catalogue/category/books/poetry_23/index.html
  ✚ record ["https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"]
  ✚ record ["https://books.toscrape.com/catalogue/the-black-maria_991/index.html"]
■ category-firsts [category=Poetry, slug=poetry_23]: 2 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
```
<!-- /capture -->

The variant is part of the run's identity: `▶` and `■` show it in brackets, and each variant has its own entry in the
report. The summary here prints one line per entry, without the variant:

<!-- capture:run-matrix summary -->
```text
category-firsts: 2 emitted, 0 rejected, 0 duplicates, 1 pages
category-firsts: 2 emitted, 0 rejected, 0 duplicates, 1 pages
```
<!-- /capture -->

### The report

`run` returns a `CrawlReport`:

| Field | What it holds |
|---|---|
| `outputId` | the output recipe the set feeds |
| `recipes` | one `RecipeReport` per recipe run (per variant), in the set's order whatever order they finished in |
| `records` | the sum of `emitted` |
| `sink` | what the sink's `close()` returned: `{ written, location? }` |
| `durationMs` | the whole run |

and each `RecipeReport`:

| Field | What it counts |
|---|---|
| `recipeId`, `variant?`, `mode`, `item?` | which run this was (`item` in worker mode) |
| `emitted` | records written to the sink |
| `rejected` | records a `skip-record` policy dropped ([part 9](08-policies.md)) |
| `duplicates` | records whose key was already seen ([de-duplication](#the-sink-and-de-duplication)) |
| `skipped` | records a resumed run already had ([resume](#resume)) |
| `stepsSkipped` | steps whose `onError: skip` swallowed a failure |
| `pages` | `page:visit` events, bootstrap pages included |
| `captchas?` | `{ detected, solved, failed }`, only when a challenge was seen |
| `error?`, `errorKind?` | why the run stopped, and the kind: `captcha`, `blocked`, `host`, `browser`, `http`, `timeout`, `network`, `mapping`, `step` or `error` |
| `durationMs` | this run |

### The sink and de-duplication

The sink receives the records: `memorySink()` (the default; `records` holds them) or `jsonLinesSink(path)` (one JSON
object per line, with a `_source` member), or anything with `open`, `write`, `close` and optionally `has(key)`. Every
emit of a run goes through one queue, so the sink sees one record at a time however many iterations run at once.

Between the mapping and the sink, a record passes two checks, in this order:

1. **resume**: with `resume: true`, a key the sink already `has` is `skipped`;
2. **de-duplication**: a key already seen is a `duplicate`. `dedupe` sets where "already seen" looks: `run` (the
   default for `run`: one set shared by every recipe of the call), `recipe` (one set per recipe run, the default in
   worker mode, where a run is an item) or `off`. Records without key fields always pass.

### Resume

A crawl that dies halfway doesn't have to start over. Open the sink in append mode and pass `resume: true`:

```ts
createCrawler({ sink: jsonLinesSink('out/books.jsonl', { append: true }), resume: true })
```

In append mode every line carries the record's key as `_key`, and `open` reads the keys already in the file.

[`travel-list.input.json`](recipes/run-resume/travel-list.input.json) reads the 11 books of the Travel category. An
earlier run of it stopped after five records, and left
[`earlier-run.jsonl`](recipes/run-resume/earlier-run.jsonl). The scene runs the recipe again with `resume: true` and a
`jsonLinesSink` in append mode over a copy of that file:

<!-- capture:run-resume trace grep=⇢|⤼|✚|■ -->
```text
  ⇢ page 1  https://books.toscrape.com/catalogue/category/books/travel_2/index.html
  ⤼ skipped ["https://books.toscrape.com/catalogue/its-only-the-himalayas_981/index.html"]
  ⤼ skipped ["https://books.toscrape.com/catalogue/full-moon-over-noahs-ark-an-odyssey-to-mount-ararat-and-beyond_811/index.html"]
  ⤼ skipped ["https://books.toscrape.com/catalogue/see-america-a-celebration-of-our-national-parks-treasured-sites_732/index.html"]
  ⤼ skipped ["https://books.toscrape.com/catalogue/vagabonding-an-uncommon-guide-to-the-art-of-long-term-world-travel_552/index.html"]
  ⤼ skipped ["https://books.toscrape.com/catalogue/under-the-tuscan-sun_504/index.html"]
  ✚ record ["https://books.toscrape.com/catalogue/a-summer-in-europe_458/index.html"]
  ✚ record ["https://books.toscrape.com/catalogue/the-great-railway-bazaar_446/index.html"]
  ✚ record ["https://books.toscrape.com/catalogue/a-year-in-provence-provence-1_421/index.html"]
  ✚ record ["https://books.toscrape.com/catalogue/the-road-to-little-dribbling-adventures-of-an-american-in-britain-notes-from-a-small-island-2_277/index.html"]
  ✚ record ["https://books.toscrape.com/catalogue/neither-here-nor-there-travels-in-europe_198/index.html"]
  ✚ record ["https://books.toscrape.com/catalogue/1000-places-to-see-before-you-die_1/index.html"]
■ travel-list: 6 emitted, 0 rejected, 0 duplicates, 5 skipped, 1 pages, … ms
```
<!-- /capture -->

The five books the file had are `⤼ skipped`, the six others are written, and `■` counts both. The steps still ran for
the five: the engine has to map a record to know its key. A resumed run saves the duplicates, not the requests.

Two things to know:

- **A key repeated within the same run is also `skipped`**, not `duplicate`. Both built-in sinks' `has` sees what
  was written earlier in this run too, and resume is checked before de-duplication.
- **A `jsonLinesSink` without `append` has nothing to resume from.** It passes the check at `createCrawler` (it has a
  `has`), but it empties the file on open, so only keys written during this run are found.

### Worker mode holds records

In worker mode ([section 7](#worker-mode)) a run's records are mapped as it goes, so `record:reject` fires live, but
they are **held**. Only when the whole item succeeds do they go through resume, de-duplication and the sink, and
`record:emit` fires. A failed item writes nothing and leaves no key behind, so it can be run again cleanly.

### Change detection

Change detection isn't part of `run`: it compares two runs' records afterwards. Records have keys, so the comparison
is record by record: `added`, `removed`, and `changed` with each field before and after (nested fields dotted:
`price.amount`). Order doesn't matter, the fields the engine stamps (`generated: now`, `uuid`) are ignored, and a run
with under half the previous run's records is flagged as `shrunk`. A site that changes its markup rarely makes a
recipe fail; it makes it find less.

```sh
opencraw run recipes/ --out books.jsonl --diff books.jsonl --changes changes.jsonl
```

From code, `diffRecords(previous, current, diffOptionsFor(output))`. [authoring.md §8.1](../recipes/authoring.md#81-change-detection)
has the details.

## 2. Sessions

Each recipe run gets its own session, opened when the run starts (after its access lease, [section 3](#3-access-proxies-and-blocks))
and closed when it ends:

| Mode | Session | Opened how |
|---|---|---|
| `web` | a new **browser context** with one page, on the crawler's shared browser | with the lease's proxy and headers, the recipe's `userAgent`, `viewport`, `cookies`, and the saved state (below) |
| `web` with `session.browserProfile` | a persistent profile of the runner (cookies, storage, cache kept between runs) | [access.md](../recipes/access.md#persistent-browser-profiles) |
| `api` | an **HTTP session** (Playwright's request context): no browser, cookies kept between requests | with the same proxy, headers and user agent, and the saved state's cookies |

A context is a browser's private window: the recipes of one crawler share the browser process but not their cookies.
A `forEach` with `concurrency` adds tabs to the run's context ([section 7](#7-concurrency-and-worker-mode)). A
rotation ([section 3](#blocks-and-rotation)) closes nothing in use: it opens a new session beside the old one.

### `session.bootstrap`

Some sites must be entered before they can be crawled: a login, a cookie wall, a country picker. `session.bootstrap`
runs steps **before** the crawl, always in a browser (an api recipe gets a throwaway browser context for it, on the
same lease, so the login and the crawl come from one IP), then keeps what `keep` lists:

- `cookies`: the context's cookies;
- `localStorage`: each origin's local storage.

A `web` recipe starts its context from that state; an `api` recipe sends those cookies with every request. The
bootstrap never emits, runs its steps one at a time under the recipe's `delayMs`, and sees the recipe's `vars` (not a
start point's).

[`quotes-signed-in.input.json`](recipes/run-session/quotes-signed-in.input.json) is an api recipe that logs in to
quotes.toscrape.com in its bootstrap (the site takes any name and password), then reads the home page over plain HTTP.
[`quotes-anonymous.input.json`](recipes/run-session/quotes-anonymous.input.json) is the same recipe without the
bootstrap. Both check for the Logout link first:

<!-- capture:run-session trace lines=30 -->
```text
▶ quotes-anonymous (api)
  ⇄ access direct (direct)
  ⇢ page 1  https://quotes.toscrape.com/
  · steps.0  request home  … ms
  ✖ step steps.1 (extract) failed: no match for a[href='/logout']
■ quotes-anonymous: 0 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
  ✖ stopped: step steps.1 (extract) failed: no match for a[href='/logout']
▶ quotes-signed-in (api)
  ⇄ access direct (direct)
  ⇢ page 1  https://quotes.toscrape.com/login
  · session.bootstrap.steps.0  goto  … ms
  · session.bootstrap.steps.1  fill  … ms
  · session.bootstrap.steps.2  fill  … ms
  · session.bootstrap.steps.3  click  … ms
  · session.bootstrap.steps.4  wait  … ms
  ⇢ page 1  https://quotes.toscrape.com/
  · steps.0  request home  … ms
  · steps.1  extract logout  … ms
  · steps.2  extract quotes  … ms
    · steps.3.steps.0  extract text  … ms
    · steps.3.steps.1  extract author  … ms
    · steps.3.steps.2  extract goodreads  … ms
  ✚ record ["“The world as we have created it is a process of our thinking. It cannot be changed without changing our thinking.”"]
    · steps.3.steps.0  extract text  … ms
    · steps.3.steps.1  extract author  … ms
    · steps.3.steps.2  extract goodreads  … ms
  ✚ record ["“It is our choices, Harry, that show what we truly are, far more than our abilities.”"]
  · steps.3  forEach  … ms
■ quotes-signed-in: 2 emitted, 0 rejected, 0 duplicates, 2 pages, … ms
```
<!-- /capture -->

The bootstrap's steps have paths under `session.bootstrap.steps`, and its page counts: `2 pages` is the login page and
the home page. The HTTP session carried the login cookie, so the page it got is the logged-in one, with a Goodreads
link that anonymous visitors don't see:

<!-- capture:run-session records n=2 -->
```json
{"text":"“The world as we have created it is a process of our thinking. It cannot be changed without changing our thinking.”","author":"Albert Einstein","goodreads":"http://goodreads.com/author/show/9810.Albert_Einstein"}
{"text":"“It is our choices, Harry, that show what we truly are, far more than our abilities.”","author":"J.K. Rowling","goodreads":"http://goodreads.com/author/show/1077326.J_K_Rowling"}
```
<!-- /capture -->

The anonymous recipe got the same page without the cookie, and its check failed. [Part 3](02-page-steps.md) logs in
the other way, with the login steps in the recipe's own steps, in web mode.

**Saving and reusing a session.** `bootstrap.saveTo` writes what was kept to a JSON file (relative to the crawler's
`storageStateDir`). Another recipe, or a later run, starts from it with `session.storageStatePath`:

- when `storageStatePath` is set, the bootstrap is **skipped**, even if the recipe has one;
- the file must **exist**. A missing file fails the run, so a recipe can't point `storageStatePath` at its own
  `saveTo` and expect the first run to create it. Run the bootstrap once (without `storageStatePath`) to create the
  file.

With a `browserProfile` and no `storageStatePath`, the bootstrap runs in the profile on every run. An api recipe with a
profile and no bootstrap starts from the cookies the profile holds, so it can pick up a login a browser left there.

## 3. Access, proxies and blocks

### Profiles and leases

Where traffic goes is the runner's business, not the recipe's. The crawler's `access` config names **profiles**:
`direct`, a `proxy` (a server, or a **preset** for a known provider such as Bright Data, Oxylabs or Zyte, with sticky or
per-request sessions), a `pool` of proxies taken in turn, a remote browser over `cdp`, or a `plugin`. A recipe asks for
what it needs (`session.access: { profile?, country?, sticky? }`) and never holds credentials.

Each recipe run takes one **lease** from its profile: a proxy server with a fresh session id (so a new IP on rotating
providers), or the next proxy of a pool, or a remote browser. The bootstrap and the crawl share it. The trace's `⇄`
line names the lease, never the credentials; every trace on this page runs `direct`:

```text
  ⇄ access direct (direct)
  ⇄ access residential (proxy https://brd.superproxy.io:44445, session k3v9x0q2ma)
```

The second line is from [access.md](../recipes/access.md), which covers profiles, presets, pools, remote browsers and
plugins in full. No proxy was used for this page.

### Block detection

After each `goto` and each `request`, the response is checked against the recipe's **block rule** (a
pagination click isn't checked). When nothing is
set, the default rule is:

```json
{ "status": [403, 429], "header": { "x-amzn-waf-action": "challenge" } }
```

`session.blockedWhen` has three optional conditions, any one of which is a block: `status` (a list), `header` (a name
mapped to a case-insensitive pattern for its value) and `text` (a case-insensitive pattern for the body). **A rule you
set replaces the default; it isn't merged with it.** `"blockedWhen": { "text": "verify you are human" }` no longer
treats a 403 as a block. List `403` and `429` again if you still want them.

A block fails the step with a `BlockedError` naming the URL and the reason (`errorKind: 'blocked'`), and emits
`access:blocked`. The point is the error message: a challenge page otherwise shows up later as a selector that matched
nothing.

Anything not in the rule isn't a block. A 404 in a browser is a page like any other: the `goto` succeeds and the
next step finds nothing. [`missing-plain.input.json`](recipes/run-not-found/missing-plain.input.json) opens a book page
that doesn't exist, with the default rule. `[404]` on the `⇢` line is the status, shown whenever it isn't 2xx:

<!-- capture:run-not-found trace -->
```text
▶ missing-plain (web)
  ⇄ access direct (direct)
  ⇢ page 1  https://books.toscrape.com/catalogue/no-such-book_0/index.html  [404]
  · steps.0  goto  … ms
  ✖ step steps.1 (extract) failed: no match for div.product_main h1
■ missing-plain: 0 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
  ✖ stopped: step steps.1 (extract) failed: no match for div.product_main h1
```
<!-- /capture -->

(In api mode a 404 fails the `request` anyway, as an `HttpError`. A block rule turns that into a block, which is what
triggers rotation.)

### Blocks and rotation

`session.onBlock: { rotate: true, attempts }` makes a block take a **new lease** (a new session id, so a new IP on a
rotating proxy), open a new session, run the bootstrap again (a login on the new IP), and retry the blocked step.
`attempts` caps the rotations per recipe run (default 2). A rotation doesn't spend the step's own retry attempts. When
the rotations are used up, the block goes to the step's `onError` like any other error.

[`missing-blocked.input.json`](recipes/run-blocked/missing-blocked.input.json) requests the same missing page over
HTTP with every layer switched on, so the order they fire in shows:

```json
"session": { "blockedWhen": { "status": [404] }, "onBlock": { "rotate": true, "attempts": 1 } },
"limits": { "delayMs": 300, "retry": { "attempts": 2, "backoffMs": 500, "statuses": [404] } },
"steps": [
  { "type": "request", "id": "book", "url": "{{start.url}}", "as": "html", "onError": { "policy": "retry", "attempts": 2, "backoffMs": 1000 } },
```

<!-- capture:run-blocked trace -->
```text
▶ missing-blocked (api)
  ⇄ access direct (direct)
  ↺ https://books.toscrape.com/catalogue/no-such-book_0/index.html: HTTP 404, try 2 in … ms
  ⇢ page 1  https://books.toscrape.com/catalogue/no-such-book_0/index.html  [404]
  ⛔ blocked https://books.toscrape.com/catalogue/no-such-book_0/index.html: HTTP 404
  ↻ new access lease (attempt 2)
  ⇄ access direct (direct)
  ↺ https://books.toscrape.com/catalogue/no-such-book_0/index.html: HTTP 404, try 2 in … ms
  ⇢ page 1  https://books.toscrape.com/catalogue/no-such-book_0/index.html  [404]
  ⛔ blocked https://books.toscrape.com/catalogue/no-such-book_0/index.html: HTTP 404
  ↻ steps.0  request book  retry 2: blocked at https://books.toscrape.com/catalogue/no-such-book_0/index.html: HTTP 404
  ↺ https://books.toscrape.com/catalogue/no-such-book_0/index.html: HTTP 404, try 2 in … ms
  ⇢ page 1  https://books.toscrape.com/catalogue/no-such-book_0/index.html  [404]
  ⛔ blocked https://books.toscrape.com/catalogue/no-such-book_0/index.html: HTTP 404
  ✖ step steps.0 (request) failed: blocked at https://books.toscrape.com/catalogue/no-such-book_0/index.html: HTTP 404
■ missing-blocked: 0 emitted, 0 rejected, 0 duplicates, 3 pages, … ms
  ✖ stopped: step steps.0 (request) failed: blocked at https://books.toscrape.com/catalogue/no-such-book_0/index.html: HTTP 404
```
<!-- /capture -->

Read it from the top:

1. `↺`: the 404 is in `limits.retry.statuses`, so the request is first retried as a failure in passing, once
   (`attempts: 2` is two tries in all).
2. `⇢ … [404]`, then `⛔`: the last response still says 404, and the block rule matches.
3. `↻ new access lease`, `⇄`: the one rotation allowed. On a `direct` profile it reopens the session from the same
   IP, which is why it can't help here.
4. The same request on the new session: `↺`, `⛔` again. No rotation left, so the step's own policy decides.
5. `↻ steps.0 request book retry 2`: the step retry, a second attempt of the whole step, with its own transport
   retries.
6. `✖`: nothing left. The run stops with the block, as `errorKind: 'blocked'`.

Six requests for one URL: two tries × (first session + rotation + step retry). That is the cost of stacking every
layer. Step 1 is also why a **429 is retried before it counts as a block**: 429 is in both the default retry
statuses and the default block rule, and the block rule only sees the response the retries end with. A site that
answers 429 once and then 200 never shows as blocked; one that keeps answering 429 does. [Section 4](#two-kinds-of-retry)
has the retry rules, and [access.md](../recipes/access.md#blocks-and-rotation) covers blocks and rotation in full.

## 4. Pace and retries

### Two limits on pace

| Setting | Scope | What it bounds |
|---|---|---|
| `limits.delayMs` (input recipe) | one recipe run | the minimum time between two **request starts** in that run, whatever loop or tab starts them |
| `limits.concurrency` (input recipe) | one recipe run | how many `forEach` iterations run at once ([section 7](#7-concurrency-and-worker-mode)) |
| `throttle` (crawler, or `access.throttle`) | a **site**, across every recipe, run and worker window of the crawler | `delayMs` between request starts to that site, and `concurrency` (requests in flight) |

Both count navigations, `request` steps, bootstrap pages and pagination clicks. A page's own sub-requests (images,
scripts, XHR) aren't counted. Where both apply, a request waits for both: the stricter one wins. Under `throttle`,
`domains` entries cover a domain and its subdomains, the longest match winning; a host no rule covers is not held
back.

[`fantasy-pages`](recipes/run-throttle/fantasy-pages.input.json) and
[`sequential-art-pages`](recipes/run-throttle/sequential-art-pages.input.json) each read three listing pages of a
category, with `delayMs: 300` of their own. The scene runs them side by side (`parallel: 2`) under a crawler throttle
of one request a second for the site:

```js
createCrawler({ parallel: 2, throttle: { domains: { 'books.toscrape.com': { delayMs: 1000, concurrency: 1 } } } })
```

<!-- capture:run-throttle trace grep=▶|⇄|⇢|■ -->
```text
▶ fantasy-pages (api)
▶ sequential-art-pages (api)
  ⇄ access direct (direct)
  ⇄ access direct (direct)
  ⇢ page 1  https://books.toscrape.com/catalogue/category/books/fantasy_19/index.html
  ⇢ page 1  https://books.toscrape.com/catalogue/category/books/sequential-art_5/index.html
  ⇢ page 2  https://books.toscrape.com/catalogue/category/books/fantasy_19/page-2.html
  ⇢ page 2  https://books.toscrape.com/catalogue/category/books/sequential-art_5/page-2.html
  ⇢ page 3  https://books.toscrape.com/catalogue/category/books/fantasy_19/page-3.html
■ fantasy-pages: 3 emitted, 0 rejected, 0 duplicates, 3 pages, … ms
  ⇢ page 3  https://books.toscrape.com/catalogue/category/books/sequential-art_5/page-3.html
■ sequential-art-pages: 3 emitted, 0 rejected, 0 duplicates, 3 pages, … ms
```
<!-- /capture -->

Both recipes start together, but their pages alternate: the site has one lane, and every request waits for the one
before it, whichever recipe sent it. The capture strips timings, so here they are from a timed run of the same two
recipes, the same day. The responses arrived at 0.37 s, 1.31 s, 2.13 s, 3.10 s, 4.08 s and 5.11 s, about one a
second, and the recipes took 4.1 s and 5.1 s. Without the throttle, the same run took 0.78 s and 0.81 s: each recipe
kept its own 300 ms spacing, and nothing held one back for the other.

<!-- capture:run-throttle summary -->
```text
fantasy-pages: 3 emitted, 0 rejected, 0 duplicates, 3 pages
sequential-art-pages: 3 emitted, 0 rejected, 0 duplicates, 3 pages
```
<!-- /capture -->

### Two kinds of retry

There are two retry mechanisms, one inside the other, and they behave differently:

| | Transport retry: `limits.retry` | Step retry: `onError: { "policy": "retry" }` |
|---|---|---|
| Repeats | one request: a `goto`'s load, a `request`, a web `paginate`'s next page by URL | the whole step; for `forEach`, `paginate` or `if`, its whole body |
| On | a failure in passing: a dropped or refused connection, a timeout, a DNS lookup that couldn't run, a proxy tunnel that failed, or a status in `statuses` (default 408, 425, 429, 500, 502, 503, 504) | any error of the step: no match, a block once rotation is used up, an HTTP error, a failed emit |
| Not on | `ENOTFOUND` / `ERR_NAME_NOT_RESOLVED` (a typo in a host name), any other status | a failure an inner step already reported: it passes through the outer step's policy |
| Default | **on**: 3 tries in all | **off**: the policy defaults to `fail` |
| Pause | **exponential with jitter**: `backoffMs × 2^(n−1)`, ×0.75 to ×1.25, so 1 s then 2 s by default, capped at `maxDelayMs` (30 s). A `Retry-After` is obeyed as given, and holds back the whole site; one longer than `maxDelayMs` is not retried at all | **linear**: `backoffMs × (attempt − 1)`, and `backoffMs` defaults to **0 ms**: an immediate retry |
| Budget | `attempts` (1 to 10) and/or `forMs`, a time budget (with `forMs` alone, tries aren't counted) | `attempts` (1 to 20) |
| Event | `request:retry`: `↺ <url>: <reason>, try N in D ms` | `step:retry`: `↻ <path>  <type>  retry N: <error>` |

A step retry runs its requests again, each with its own transport retries: in the trace above, one step retry cost
two more requests. Retrying a `forEach` that emits re-runs the whole loop and emits its records again; de-duplication
drops the repeats only when the output has key fields.

`limits.retry` in a recipe is laid over the crawler's `retry`, which is laid over the defaults, field by field.

**Not shown live:** a site that answers 429 on purpose. The engine's end-to-end test does it against a local fixture
site that answers 503 once to a browser and 429 with `Retry-After: 1` once to an api recipe
([`e2e/retry.e2e.test.ts`](../../packages/core/e2e/retry.e2e.test.ts), an excerpt):

```ts
it('retries a 503, and waits as long as a 429 asks', async () => {
  const started = Date.now()
  const { report, retries } = await crawl([recipe('web-503', 'web', 'key=web-503&fail=1&mode=status'), recipe('api-429', 'api', 'key=api-429&fail=1&mode=retry-after')])
  expect(report.recipes.map(entry => [entry.emitted, entry.error])).toEqual([[1, undefined], [1, undefined]])
  expect(retries.map(event => [event.recipeId, event.reason, event.delayMs])).toEqual([['web-503', 'HTTP 503', expect.any(Number)], ['api-429', 'HTTP 429', 1000]])
  expect(Date.now() - started).toBeGreaterThanOrEqual(1000)
}, 60000)
```

The 503 waits a jittered backoff (`expect.any(Number)`); the 429 waits exactly the 1000 ms the server asked for. Both
recipes then succeed, and neither counts as blocked.

## 5. Captchas

A captcha is solved by a **solver**, a function you register (`createCrawler({ captchaSolvers: [...] })`) that calls
a solving service or asks a person. Solving costs money and may break a site's terms, so this page runs none live. In
outline, when `session.captcha` names a solver:

1. **Detect.** After each `goto`, `click`, `press` and pagination click, the engine looks for the first *visible*
   reCAPTCHA, hCaptcha or Turnstile widget (or `detect.selector`). A `captcha` step looks at one known point, and
   also finds invisible reCAPTCHA v3. Api recipes don't solve: with `session.captcha` set, a challenge in an HTTP
   response is reported as a block.
2. **Solve.** The solver gets the kind, the URL and the site key. One attempt spends one of the run's `maxSolves`
   (default 10), and has `timeoutMs` (default 2 minutes).
3. **Verify.** The solver's answer is only a claim. The engine waits up to 10 s for the challenge to be gone and,
   if given, `verify.selector` to appear. A token the site rejects is a failed attempt.
4. **Attempts.** Up to `attempts` (default 3) per challenge. After the last, a `CaptchaError`, which is a block: with
   `onBlock.rotate` the run takes a new IP and tries again.
5. **Budget.** Once `maxSolves` is spent, the next challenge is left unsolved (`captcha:budget`) and the step fails.

`onBlock.solve: true` handles a block page that shows a challenge: it is solved in place instead of failing, with
rotation as the fallback. What the trace looks like, from the engine's end-to-end test against a local fake reCAPTCHA
([`e2e/captcha.e2e.test.ts`](../../packages/core/e2e/captcha.e2e.test.ts), an excerpt): the solver's first answer is
wrong, the page keeps showing the challenge, and the second answer passes.

```ts
expect(ofType(events, 'captcha:failed')).toEqual([expect.objectContaining({ attempt: 1, reason: 'the page still shows the challenge' })])
expect(ofType(events, 'captcha:solved')).toEqual([expect.objectContaining({ attempt: 2, solver: 'fake' })])
expect(report.recipes[0].captchas).toEqual({ detected: 1, solved: 1, failed: 1 })
```

In a trace, those are `⚿ captcha recaptcha-v2 on <url>`, `✗ captcha attempt 1 failed: the page still shows the
challenge` and `✓ captcha solved by fake (attempt 2, … ms)`. [captcha.md](../recipes/captcha.md) covers form captchas,
the manual solver and writing a solver, and [`examples/captcha-solver`](../../examples/captcha-solver) is a working
one.

## 6. Allowed hosts

A service that runs other people's recipes must not become a way into its own network or files. `allowedHosts` limits
every request the crawler makes:

```js
createCrawler({ allowedHosts: ['quotes.toscrape.com'] })
```

A pattern is a host, `*.host` (the host and its subdomains), `host:port`, or `*`. It is enforced wherever a request
leaves:

| Where | How |
|---|---|
| browser navigations, and everything a page loads by itself (scripts, images, frames, `fetch`) | the context routes every request and aborts one off the list: `net::ERR_BLOCKED_BY_CLIENT` |
| web sockets | a socket to a host off the list is closed (code 1008) |
| service workers | blocked when a list is set, since their requests would bypass the routing |
| `request` steps (api, and web mode's through the page) | `HostNotAllowedError` before anything is sent |
| redirects of `request`s | followed one hop at a time (up to 20), each hop checked **before** it is followed |
| `file:` URLs | refused whatever the list says, even `*`. Without a list, a `request` to a `file:` URL reads the file. `data:`, `blob:` and `about:` never leave the page and pass |

Both refusals are `errorKind: 'host'`. The check is by name: a public name that resolves to a private address isn't
caught, so run such a service in a network that can't reach what it shouldn't.

[`quotes-api`](recipes/run-allowed-hosts/quotes-api.input.json) and
[`quotes-web`](recipes/run-allowed-hosts/quotes-web.input.json) read the first quote, then follow the footer link to
goodreads.com:

<!-- capture:run-allowed-hosts trace grep=^[^\u001b]*$ -->
```text
▶ quotes-api (api)
  ⇄ access direct (direct)
  ⇢ page 1  https://quotes.toscrape.com/
  · steps.0  request home  … ms
  · steps.1  extract text  … ms
  · steps.2  extract author  … ms
  ✚ record ["“The world as we have created it is a process of our thinking. It cannot be changed without changing our thinking.”"]
  · steps.3  emit  … ms
  · steps.4  extract source  … ms
  ✖ step steps.5 (request) failed: https://www.goodreads.com/quotes is outside the allowed hosts (quotes.toscrape.com)
■ quotes-api: 1 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
  ✖ stopped: step steps.5 (request) failed: https://www.goodreads.com/quotes is outside the allowed hosts (quotes.toscrape.com)
▶ quotes-web (web)
  ⇄ access direct (direct)
  ⇢ page 1  https://quotes.toscrape.com/
  · steps.0  goto  … ms
  · steps.1  extract text  … ms
  · steps.2  extract author  … ms
  ≡ duplicate ["“The world as we have created it is a process of our thinking. It cannot be changed without changing our thinking.”"]
  · steps.3  emit  … ms
  · steps.4  extract source  … ms
```
<!-- /capture -->

The api recipe's request never left: `HostNotAllowedError` names the URL and the list. The web recipe's `goto`
failed too, with `page.goto: net::ERR_BLOCKED_BY_CLIENT at https://www.goodreads.com/quotes`. That line is left out
above because Playwright appends a call log to it. (`≡ duplicate`: the web recipe found the same quote, and under
`dedupe: 'run'` the first recipe to emit a key keeps it.)

## 7. Concurrency and worker mode

Three dials, from the smallest to the largest.

### Inside a recipe: `forEach` concurrency

`limits.concurrency: 3` lets a `forEach` **over a list** run three iterations at once: three requests in api mode,
three tabs of the run's browser context in web mode (each tab opens blank, so the body starts with a `goto`, and closes
when its iteration ends). A `forEach` over a `selector` stays sequential, since its elements live on one page. The limit
is per recipe run: the outermost concurrent loop takes the permits, and loops inside its iterations run one at a time,
so nesting never multiplies what is in flight.

[`travel-details.input.json`](recipes/run-concurrency/travel-details.input.json) reads the Travel listing, then each
book's own page, with `concurrency: 3`, `delayMs: 300` and `maxRecords: 6`:

<!-- capture:run-concurrency trace grep=▶|⇢|✚|forEach|■ -->
```text
▶ travel-details (api)
  ⇢ page 1  https://books.toscrape.com/catalogue/category/books/travel_2/index.html
  ⇢ page 1  https://books.toscrape.com/catalogue/its-only-the-himalayas_981/index.html
  ✚ record ["https://books.toscrape.com/catalogue/its-only-the-himalayas_981/index.html"]
  ⇢ page 1  https://books.toscrape.com/catalogue/full-moon-over-noahs-ark-an-odyssey-to-mount-ararat-and-beyond_811/index.html
  ✚ record ["https://books.toscrape.com/catalogue/full-moon-over-noahs-ark-an-odyssey-to-mount-ararat-and-beyond_811/index.html"]
  ⇢ page 1  https://books.toscrape.com/catalogue/see-america-a-celebration-of-our-national-parks-treasured-sites_732/index.html
  ✚ record ["https://books.toscrape.com/catalogue/see-america-a-celebration-of-our-national-parks-treasured-sites_732/index.html"]
  ⇢ page 1  https://books.toscrape.com/catalogue/vagabonding-an-uncommon-guide-to-the-art-of-long-term-world-travel_552/index.html
  ✚ record ["https://books.toscrape.com/catalogue/vagabonding-an-uncommon-guide-to-the-art-of-long-term-world-travel_552/index.html"]
  ⇢ page 1  https://books.toscrape.com/catalogue/under-the-tuscan-sun_504/index.html
  ✚ record ["https://books.toscrape.com/catalogue/under-the-tuscan-sun_504/index.html"]
  ⇢ page 1  https://books.toscrape.com/catalogue/a-summer-in-europe_458/index.html
  ✚ record ["https://books.toscrape.com/catalogue/a-summer-in-europe_458/index.html"]
  ⇢ page 1  https://books.toscrape.com/catalogue/the-great-railway-bazaar_446/index.html
  ⇢ page 1  https://books.toscrape.com/catalogue/a-year-in-provence-provence-1_421/index.html
  · steps.2  forEach  … ms
■ travel-details: 6 emitted, 0 rejected, 0 duplicates, 9 pages, … ms
```
<!-- /capture -->

<!-- capture:run-concurrency summary -->
```text
travel-details: 6 emitted, 0 rejected, 0 duplicates, 9 pages
```
<!-- /capture -->

The trace reads in list order, each page's record before the next page, because on this site the rate, not the
concurrency, was the limit. A timed run of the same recipe shows why. The three iterations started together, 271 ms in, but
`delayMs` let their requests out one every 300 ms, and each page answered about 90 ms after its turn (at 361, 664,
961, 1262 ms…). Each iteration had finished before the next one's request could start. `delayMs` is a rate, not a
pause: `concurrency: 3, delayMs: 300` means at most three requests in flight **and** at most one start every 300 ms.
Concurrency pays off when a response takes longer than the spacing: a slow site, or web tabs that render pages.
There, lines of different iterations interleave in the trace, all under the same path (a trace has no iteration
index), and records come out in the order iterations finish, not list order.

`9 pages` for 6 records is `maxRecords` at work: the seventh and eighth iterations had already started when the sixth
record was written. Iterations in flight finish, but emit nothing more. `maxRecords` is exact. Every detail page
is `page 1` because `page.number` counts `paginate`'s pages, and this recipe doesn't paginate.

### Across recipes: `parallel`

`createCrawler({ parallel: 2 })` runs up to two input recipes of the set at once, each with its own session and
lease. They share the browser, the sink, the de-duplication set and the per-site throttle; the [throttle
scene](#two-limits-on-pace) above runs this way. Variants of one matrix recipe stay one after the other. Reports keep
the set's order.

### Worker mode

`crawler.work(set, source, options)` is for a queue of items (a recipe plus vars each) rather than a fixed set:
thousands of report queries, say, fed as they come. A **pool of windows** works through them. A window is a lane with
its own browser context (or HTTP session), lease and step memory, and it runs item after item **without closing**.

- **`keep` steps.** A top-level step with `keep: true` (a `goto`, a `select`, a `fill`…) is skipped when the window
  already holds the same rendered step from its last item: `≡ steps.1  select  kept`. When one runs, the kept steps
  after it are forgotten, so a changed filter re-applies everything below it. `window.check` is an element a reused
  window must still show, or it is replaced.
- **How the pool grows and shrinks** (`windows: { min, max, start, grow, shrink, restart, idle }`). After `grow.after`
  successes in a row (default 10), counted only while no window is waiting for work, one more window, up to `max`. On a
  failure, half the windows (`shrink: 'half'`, the default) or one fewer, never below `min`, and only for failures of
  items that started after the last shrink. A burst of failures shrinks the pool once. A window leaves only
  **between** items; a busy one is never cut off. After `restart.after` failures in a row the browser is relaunched
  and the pool goes back to `min`.
- **Outcomes.** An item ends as `success`, `failure` (a block, retries used up, a failed step) or `neutral` (a captcha
  the solver couldn't pass, a browser that died): neutral moves nothing. Any non-success closes that window, and the
  lane opens a fresh one for its next item. `classify` overrides the defaults.
- **The idle rule.** With `idle.afterMs`, a window that waited that long for an item retires, never below `min`. It
  isn't a failure. A source that still hands it an item later gets a new window for it (`late`), so nothing is lost.
- **The inbox.** `createWorkInbox()` is a source fed by `submit(item)`, which returns that item's own result. An id
  already queued or running is not run twice: the caller gets the same promise. Waiting windows are served last come,
  first served, so the one that just finished takes the next item and long-idle ones can retire.
- **Records per item.** `dedupe` defaults to `recipe`, which here means per item: the same key in two items is each
  item's record. Records are held until the item succeeds ([section 1](#worker-mode-holds-records)), and each carries
  `source.item`. `matrix` isn't expanded in worker mode: the items are the variants.

**Not shown live**, since it needs a site under real load. From the engine's end-to-end test against a local report
page ([`e2e/worker.e2e.test.ts`](../../packages/core/e2e/worker.e2e.test.ts), an excerpt): 6 good items, one that
fails, then 16 more, on a pool of 1 to 3 windows that grows after 2 successes:

```ts
const { events, result } = await work([...goods(6, 'DL', ['DL1', 'DL2']), item('GA', 'BAD'), ...goods(16, 'GA', ['GA1'])], { windows: { min: 1, max: 3, grow: { after: 2 } } })
const changes = ofType(events, 'windows:change').map(event => [event.from, event.to])
expect(changes.slice(0, 2)).toEqual([[1, 2], [2, 3]])
expect(changes.some(([from, to]) => to < from)).toBe(true)
// Only the bad item failed: the windows the shrink sent away finished their items first.
expect(result.items).toEqual({ success: 22, failure: 1, neutral: 0 })
expect(result.windows.peak).toBe(3)
expect(ofType(events, 'window:close').some(event => event.reason === 'retire')).toBe(true)
```

The pool grew 1 → 2 → 3, shrank on the bad item, and the windows it sent away (`retire`) finished their items first:
one failure, not four. [worker-mode.md](../recipes/worker-mode.md) covers the recipe, sources, the inbox and a sample
trace.

## 8. Events and the trace

Everything the engine does is an event, passed to `onEvent` with `type`, `recipeId`, a timestamp `at`, and in worker
mode `item` and `window`. A listener that throws is ignored. `traceLine(event)` turns one into an indented line, or
`undefined` for the two it doesn't print. The step events are indented by the step's depth (one level per `steps` or
`else` in its path), most others by one level. In worker mode each line starts with its window, `[w3]`.

| Event | `traceLine` | Emitted when |
|---|---|---|
| `recipe:start` | `▶ <recipe> [vars] (web)` | a recipe run starts; `[vars]` for a matrix variant or work item |
| `recipe:finish` | `■ <recipe>: N emitted, N rejected, N duplicates, [N skipped,] [N steps skipped,] N pages, T ms`, then `✖ stopped: <error>` if it failed | a recipe run ends |
| `access:lease` | `⇄ access <profile> (<kind> [server], [session id])` | a lease is taken: at the start, and on each rotation |
| `access:blocked` | `⛔ blocked <url>: <reason>` | a response matched the block rule |
| `access:rotate` | `↻ new access lease (attempt N)` | a block makes the run take a new lease |
| `request:retry` | `↺ <url>: <reason>, try N in T ms` | a transport retry, or a `goto.ready` reload |
| `page:visit` | `⇢ page N  <url>  [status]` | a navigation or request got its response; `[status]` only when it isn't 2xx |
| `captcha:detected` | `⚿ captcha <kind> on <url>` | a challenge is showing |
| `captcha:solve` | *(nothing)* | a solver starts an attempt |
| `captcha:solved` | `✓ captcha solved by <solver> (attempt N, T ms)` | the page confirmed a solve |
| `captcha:failed` | `✗ captcha attempt N failed: <reason>` | an attempt failed or was refused |
| `captcha:budget` | `⛔ captcha left unsolved: the run's N solves are spent` | `maxSolves` is spent |
| `step:start` | *(nothing)* | a step starts |
| `step:finish` | `· <path>  <type> [id]  T ms` | a step finished; every step prints once, here |
| `step:retry` | `↻ <path>  <type> [id]  retry N: <error>` | an `onError: retry` attempt |
| `step:skip` | `↷ <path>  <type> [id]  skipped: <error>` | `onError: skip` swallowed a failure |
| `step:branch` | `⑂ <path>  then` or `else` | an `if` chose a branch |
| `step:kept` | `≡ <path>  <type>  kept` | worker mode: a `keep` step the window already holds |
| `record:emit` | `✚ record <key>` or `(no key)` | a record was written |
| `record:reject` | `✖ record rejected: <field>: <reason>` | a `skip-record` policy dropped a record |
| `record:duplicate` | `≡ duplicate <key>` | the key was already seen |
| `record:skipped` | `⤼ skipped <key>` | a resumed run found the key in the sink |
| `window:open`, `window:close` | `⧉ window opened (<reason>)`, `⧉ window closed (<reason>)` | worker mode: `start`, `grow`, `late`, `fresh`, `recycle`; `retire`, `idle`, `drained`, `fresh`, `recycle`, `restart`, `recipe` |
| `windows:change` | `⇅ windows A → B: <reason>` | worker mode: the pool's target changed |
| `browser:restart` | `⟳ browser restarted: <reason>` | worker mode: failures in a row |
| `item:finish` | `✓`, `✖` or `↩ item <id> <outcome>, T ms[: error]` | worker mode: an item ended (success, failure, neutral) |
| `warning` | `! <message>` | a hook's or solver's log, a country no profile applies, a solver that didn't close |
| `error` | `✖ <message>` | a run's failure, a source that threw, a hook's error log |

`step:start` prints nothing because `step:finish` carries the duration, so each step appears once, when it's done.
That is also why a loop's body lines come before the loop's own `· steps.2  forEach` line. Every iteration or page
reports the same path. `step:start` is still an event: count them, or time them, in your own listener.

### `debug`

`createCrawler({ debug: true })` (the CLI's `--dry-run` sets it) adds two things to each `record:emit`:

- `scope`: the snapshot the record was mapped from, everything the emitting step could see. `record:reject` carries it
  too.
- `mapping`: for each field, the value its `from` read and the value after each transform, in order. The values are
  before coercion to the field's type: the trace shows what the transforms produced, not what reached the record.
  Inside an `each` rule the keys are `<target>[<index>].<field>`. `record:reject` carries no mapping.

`traceLine` prints neither. The capture script behind this guide reads them to draw the scope blocks and value tables.
For the first record of the concurrency scene, the scope (part of it):

<!-- capture:run-concurrency scope ids=link,title,price,upc,page -->
```json
{
  "link": "../../../its-only-the-himalayas_981/index.html",
  "title": "It's Only the Himalayas",
  "price": "£45.17",
  "upc": "a22124811bfa8350",
  "page": {
    "url": "https://books.toscrape.com/catalogue/its-only-the-himalayas_981/index.html",
    "number": 1
  }
}
```
<!-- /capture -->

and the mapping:

<!-- capture:run-concurrency mapping fields=url,price -->
| Field | Step | Value |
|---|---|---|
| `url` | read | `"https://books.toscrape.com/catalogue/its-only-the-himalayas_981/index.html"` |
| | **field** | `"https://books.toscrape.com/catalogue/its-only-the-himalayas_981/index.html"` |
| `price` | read | `"£45.17"` |
| | `currency` | `{"amount":45.17,"currency":"GBP"}` |
| | **field** | `{"amount":45.17,"currency":"GBP"}` |
<!-- /capture -->

`url` has no transform: `page.url` is already absolute, since a `request` sets the page to the URL it fetched.

---

That is the last part. Back to [part 1: a run, end to end](README.md#a-run-end-to-end).
