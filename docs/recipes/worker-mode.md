# Worker mode: a pool of windows working through a queue

`crawler.run` crawls a recipe set and stops. **Worker mode** is for long crawls of one site with thousands of
items: one report per month × region × filter set, fed from a queue that another process fills. The pool:

- **keeps every window busy.** A window that finishes an item takes the next one at once. There are no
  batches, and no window waits for the others;
- **keeps each window's page between items.** A window remembers what its page already shows (the report
  type, the axes, the region picked) and an item only changes what differs, then submits;
- **matches the site's health.** It adds a window while items succeed and backs off when they fail. It never
  takes a window away from an item it is running.

It is a restaurant floor. Waiters take the next order as soon as their hands are free, and leave the
cutlery on the table between guests. When the kitchen falls behind, the manager sends waiters home as they
finish their tables. The manager never pulls a plate from under a guest.

## 1. The recipe

A worker recipe is an ordinary input recipe. Two additions tell the window what it may keep:

```json
{
  "kind": "input", "id": "report", "output": "row", "mode": "web",
  "vars":   { "state": "DL", "rto": "", "group": "" },
  "start":  [{ "url": "https://stats.example.gov/report" }],
  "window": { "check": "#axis", "maxItems": 200 },
  "steps": [
    { "type": "goto",   "url": "{{ start.url }}", "keep": true },
    { "type": "select", "selector": "#axis",  "value": "maker", "keep": true },
    { "type": "select", "selector": "#state", "values": ["{{ vars.state }}"], "force": true, "keep": true },
    { "type": "select", "selector": "#rto",   "values": ["{{ split(vars.rto) }}"], "force": true, "clear": true, "keep": true },
    { "type": "select", "selector": "#group", "values": ["{{ split(vars.group) }}"], "force": true, "clear": true, "keep": true },
    { "type": "click",  "selector": "#apply" },
    { "type": "wait",   "selector": "#result .row" },
    { "type": "extract", "id": "rows", "selector": "#result .row", "kind": "css", "many": true },
    { "type": "forEach", "over": "rows", "as": "row", "emit": true, "steps": [] }
  ],
  "mapping": { "row": { "from": "row" } }
}
```

**`keep: true`** marks a page action the window may skip:
- The window remembers each kept step as it last ran it, with every template rendered (`#state` set to `DL`).
- On the next item, a kept step that would do the same is skipped (`step:kept` in the trace).
- A kept step that runs again, because its value changed, makes the window forget **the kept steps after it**.
  A change cascades: a new state reloads the RTO list, so the RTO pick must run again even when its value is
  the one the window holds.
- Keep is for top-level page actions only (`goto`, `click`, `fill`, `press`, `select`, `scroll`, `wait`,
  `evaluate`), and never on a step with an `id`: a skipped step binds nothing, so its value would be unset
  for the next item. Loading refuses both.
- Steps without `keep` (Apply, the wait, the extract) run for every item.

**`clear: true`** on a `select` is not optional on a reused page. A blank filter var normally leaves the
control alone. On a reused page, the control would then keep the last item's pick, and item 2 ("every
group") would silently report item 1's group. With `clear`, blank values empty the control.

**`window.check`** is an element a reused page must still show before an item runs on it. A session that
expired or a page that went elsewhere fails the check, and the window is replaced instead of failing the
item. **`window.maxItems`** replaces a window after that many items anyway: memory, and server state that
grows stale.

The same recipe runs as it is with `crawler.run` or the CLI: without a window, `keep` changes nothing.

## 2. The work source

The pool asks a **work source** for items, from several windows at once, and tells it how each ended:

```ts
interface WorkItem   { id: string, vars: Record<string, string | number | boolean>, recipe?: string }
interface WorkSource {
  next (): Promise<WorkItem | undefined>            // may wait (a refill); undefined = no more work
  done? (item, report, records): Promise<void>      // succeeded: its records are written, and given here too
  failed? (item, report, outcome): Promise<void>    // 'failure' or 'neutral'; nothing of it was written
}
```

- `workFrom(items)` turns a plain list into a source.
- A real queue (a table with claims and leases, priorities, a local buffer refilled when it runs low) is
  the source's business. `next` returns from the buffer and refills it; `done` marks the item consumed;
  `failed` counts a retry (`failure`) or puts it back as it was (`neutral`).
- `item.id` is on every event of the item, on its report (`item`) and on its records (`record.source.item`).
- `item.recipe` picks the input recipe when the set has several.

**Records are held until the item succeeds.** Mapped records wait in memory. De-duplication, `resume` and
the sink see them only when the whole item succeeded. A failed item therefore writes nothing and leaves no
key behind, so running it again later is safe. `done` receives the records, for a source that files one
document per item.

## 3. Running it

```ts
import { createCrawler, loadRecipeSet, jsonLinesSink } from '@opencraw/core'

const recipes = await loadRecipeSet({ output: 'row.output.json', inputs: ['report.input.json'] })
const crawler = createCrawler({ sink: jsonLinesSink('rows.jsonl'), captchaSolvers: [reader], onEvent })
try {
  const report = await crawler.work(recipes, source, {
    windows: { min: 5, max: 20, start: 12, grow: { after: 10 }, shrink: 'one', restart: { after: 20 } },
  })
  // report: { items: { success, failure, neutral }, records, windows: { start, peak, final }, restarts, sink, durationMs }
} finally {
  await crawler.close()
}
```

One `run` or `work` at a time per crawler: they share its sink.

## 4. How many windows

| Setting | Default | What it does |
|---|---|---|
| `windows: 4` | 1 | A fixed pool of four. |
| `min`, `max` | 1, `min` | The bounds. |
| `start` | `min` | Where the pool starts. |
| `grow.after` | 10 | One more window after this many successes in a row. |
| `shrink` | `half` | On a failure: half the windows (`half`) or one fewer (`one`). |
| `restart.after` | never | After this many failures in a row, the browser is relaunched and the pool goes back to `min`. |

What makes the pool safe to leave running overnight:

- **A window leaves only between items.** A shrink lowers the number the pool aims for. The windows above it
  leave as they finish their current item; the window whose item failed is usually the first. No item is
  ever cut off by a shrink, so one failure never causes another.
- **One bad moment shrinks the pool once.** When the site hiccups, every item in flight fails at about the
  same time. Only failures of items that started *after* the last shrink shrink it again. The others count
  towards a restart, but the shrink has already answered them. TCP treats a burst of losses the same way.
- **A failed item gets a fresh window.** Its page is in a state nobody knows: the window is closed and the
  lane opens a new one for its next item (`window:open fresh`).
- **A restart waits for every running item to finish.** New items wait for the relaunch; windows opened in
  the old browser are replaced when their next item comes. After a restart the pool is back at `min` and
  grows again from there.
- **A browser that dies is relaunched.** Items that were running end as `neutral` (the source gets them back
  untouched), and the next window launches a new browser.

**How an item ended** (`classify`, overridable):

| Outcome | Default for | Effect |
|---|---|---|
| `success` | no error | Counts towards growing; records written; `done`. |
| `failure` | a block, retries used up (HTTP errors, timeouts, connection failures), a step that failed | Shrinks the pool; fresh window; `failed(…, 'failure')`. |
| `neutral` | a captcha the solver could not get past; the browser closed under the item | The pool does not move; fresh window; `failed(…, 'neutral')`: put it back as it was. |

`report.errorKind` says why a run stopped (`captcha`, `blocked`, `browser`, `http`, `timeout`, `network`,
`step`, `mapping`, `error`). Write your own `classify` from it, for instance to treat `step` failures (a
selector that matched nothing: a recipe problem, not the site's health) as `neutral`.

## 5. Watching it

Every event of a window carries `window` and `item`, and `traceLine` prefixes its lines with `[w3]`:

```text
[w1] ⧉ window opened (start)
[w1] ▶ report [state=DL, rto=DL53, group=Bus] (web)
[w1]   ≡ steps.0  goto  kept
[w1]   ≡ steps.1  select  kept
[w1]   · steps.3  select  812 ms
[w1] ■ report [state=DL, rto=DL53, group=Bus]: 12 emitted, 0 rejected, 0 duplicates, 1 pages, 4213 ms
[w1] ✓ item DL-DL53-Bus success, 4214 ms
[w1] ⇅ windows 12 → 13: 10 successes in a row
[w13] ⧉ window opened (grow)
[w4] ✖ item GA-GA1-Car failure, 30211 ms: step steps.6 (wait) failed: Timeout 30000ms exceeded
[w4] ⇅ windows 13 → 12: an item failed
[w4] ⧉ window closed (fresh)
[w9] ⧉ window closed (retire)
```

## 6. Limits

- Kept steps are the top-level list's. A page whose state cannot be read back from what the recipe did
  (a wizard that moves forward only) is not a good fit: leave `keep` off and each item redoes its steps on
  the same window, which still saves the context and the browser start.
- A window runs one recipe. An item for another recipe of the set replaces the window.
- The pool lives in one process. Several machines each run their own pool; claiming items so that no two
  machines take the same one is the source's job.
