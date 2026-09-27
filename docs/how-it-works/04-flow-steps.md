<p align="center">
  <img src="../assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# Flow steps

[← How OpenCraw works](README.md) · Next: [6. Templates and scope](05-templates-and-scope.md)

Flow steps decide which steps run, how often, and when a record comes out: `forEach` runs a body once per item,
`paginate` once per page, `if` picks a branch, `collect` carries values out of a loop, and `emit` produces a
record. They run the same way in web and api mode, apart from how `paginate` finds its next page: the leaf
steps inside them (`goto`, `request`, `extract`…) are what differ. This page runs each of them on a practice
site or a public API and shows the trace, because a trace is where loops and pages become visible. It ends with
what happens when a step fails, and with `limits.maxRecords`.

[authoring.md §3.3](../recipes/authoring.md#33-steps-of-both-modes), [§3.6](../recipes/authoring.md#36-pagination),
[§3.8](../recipes/authoring.md#38-decisions) and
[§7](../recipes/authoring.md#7-policies-what-happens-when-something-is-missing-or-fails) are the reference.

## Reading a trace

`traceLine` prints one line per event, indented by how deep the step is: one level per `steps` or `else` in its
path. `steps.3.steps.2.steps.0` is the first step of the body of step 2 of the body of top-level step 3. Every
iteration and every page prints the same path: the trace has no iteration index, so count the repeats.

| Glyph | Event |
|---|---|
| `▶` `■` | The recipe starts; the recipe ends, with its counts and, if it stopped, `✖ stopped: <error>` |
| `⇢ page N  <url>` | A page or document was visited (a `goto`, a `request`, a next-page click), with its status when it isn't 2xx |
| `· <path>  <type> <id>` | A step finished. A control step (`forEach`, `paginate`, `if`) prints its line after its body |
| `⑂ <path>  then` / `else` | An `if` chose a branch |
| `✚ record <key>` | A record was emitted, with its key |
| `↷` | A step failed and its `skip` policy let the walk go on |
| `↻` | A step failed and its `retry` policy runs it again |
| `↺` | A request failed in passing (a dropped connection, a 503) and is sent again |
| `✖` | A step failed for good, or a record was rejected |

A step skipped by its `when` prints nothing at all.

## `forEach`

`forEach` runs its `steps` once per item of a list, each time in a **fresh child scope** where the item is bound
under `as`. With `emit: true`, the iteration's scope becomes a record once its body has run. The recipe
[`quotes-foreach`](recipes/flow-foreach/quotes-foreach.input.json) loops over the quotes of
[quotes.toscrape.com's API](https://quotes.toscrape.com/api/quotes?page=1), and over each quote's tags inside:

```json
{ "type": "set", "id": "seen", "value": [] },
{ "type": "forEach", "over": "quotes", "as": "quote", "emit": true, "steps": [
  { "type": "extract", "id": "author", "from": "quote", "selector": "$.author.name", "kind": "jsonpath" },
  { "type": "set", "id": "tags", "value": "{{quote.tags}}" },
  { "type": "forEach", "over": "tags", "as": "tag", "steps": [
    { "type": "collect", "into": "seen", "value": "{{tag}}" }
  ]},
  { "type": "set", "id": "tagCount", "value": "{{ len(tags) }}" },
  { "type": "set", "id": "seenCount", "value": "{{ len(seen) }}" }
]}
```

<!-- capture:flow-foreach trace lines=16 -->
```text
▶ quotes-foreach (api)
  ⇄ access direct (direct)
  ⇢ page 1  https://quotes.toscrape.com/api/quotes?page=1
  · steps.0  request list  … ms
  · steps.1  extract quotes  … ms
  · steps.2  set seen  … ms
    · steps.3.steps.0  extract author  … ms
    · steps.3.steps.1  set tags  … ms
      · steps.3.steps.2.steps.0  collect  … ms
      · steps.3.steps.2.steps.0  collect  … ms
      · steps.3.steps.2.steps.0  collect  … ms
      · steps.3.steps.2.steps.0  collect  … ms
    · steps.3.steps.2  forEach  … ms
    · steps.3.steps.3  set tagCount  … ms
    · steps.3.steps.4  set seenCount  … ms
  ✚ record (no key)
  …
```
<!-- /capture -->

The inner loop runs four times for Einstein's first quote (four `collect` lines at depth 3), and its own line,
`steps.3.steps.2  forEach`, comes after them. The scope of the first two records:

<!-- capture:flow-foreach scope ids=author,tags,tagCount,seen,seenCount record=0 -->
```json
{
  "author": "Albert Einstein",
  "tags": [
    "change",
    "deep-thoughts",
    "thinking",
    "world"
  ],
  "tagCount": 4,
  "seen": [
    "change",
    "deep-thoughts",
    "thinking",
    "world"
  ],
  "seenCount": 4
}
```
<!-- /capture -->

<!-- capture:flow-foreach scope ids=author,tags,tagCount,seen,seenCount record=1 -->
```json
{
  "author": "J.K. Rowling",
  "tags": [
    "abilities",
    "choices"
  ],
  "tagCount": 2,
  "seen": [
    "change",
    "deep-thoughts",
    "thinking",
    "… 3 more"
  ],
  "seenCount": 6
}
```
<!-- /capture -->

- **`over` takes one id, not a path.** `"over": "quote.tags"` is refused at load (`an id is a word`), which is
  why the recipe `set`s `tags` first. A lone placeholder keeps its type, so `tags` is the list itself.
- **What `over` holds decides the iterations.** A list gives one per item, `undefined` or `null` gives none (and
  no error), and any other value gives exactly one, with that value as the item.
- **Each iteration's scope is dropped when it ends.** `author`, `tags` and `tagCount` of the first quote are
  gone when the second starts: a quote without an author could not inherit the previous one's. The inner loop's
  `tag` is not in either record: its iterations ended before the emit.
- **`collect` writes into the scope that binds the list**, here the recipe's top scope, so `seen` grows across
  iterations: 4 tags after the first quote, 6 after the second. Each `collect` replaces the list with a longer
  copy instead of changing it, so a record keeps the list as it was at its emit.
- **`emit: true` emits the iteration's scope after its body**, with everything visible from there: the loop
  variable, the ids bound in the body, and every enclosing scope's ids, `page`, `vars` and `start`.
  `emit: { "output": "…" }` names the output, which must be this recipe's.
- **One emitting construct per path.** An emitting `forEach` may contain no `emit` step and no other emitting
  `forEach`: the loader refuses it. The inner loop here doesn't emit.

`forEach` can also loop over the elements a CSS selector matches on the live page (`selector` instead of
`over`, web mode only), re-finding each element by position on every use; [part 3](02-page-steps.md) shows it.

### Running iterations at once

`limits.concurrency` above 1 lets a `forEach` over a list run that many iterations at the same time. The recipe
[`mystery-parallel`](recipes/flow-concurrency/mystery-parallel.input.json) fetches the Mystery listing of
[books.toscrape.com](https://books.toscrape.com), then every book page, three at a time:

```json
"limits": { "delayMs": 300, "concurrency": 3, "maxRecords": 6 },
"steps": [
  { "type": "request", "url": "{{start.url}}" },
  { "type": "extract", "id": "links", "selector": "article.product_pod h3 a", "kind": "css", "take": "attr:href", "many": true },
  { "type": "forEach", "over": "links", "as": "link", "emit": true, "steps": [
    { "type": "request", "url": "{{link}}" },
    { "type": "extract", "id": "title", "selector": "h1", "kind": "css" },
    { "type": "extract", "id": "upc", "selector": "table.table-striped td", "kind": "css" }
  ]}
]
```

<!-- capture:flow-concurrency trace lines=50 -->
```text
▶ mystery-parallel (api)
  ⇄ access direct (direct)
  ⇢ page 1  https://books.toscrape.com/catalogue/category/books/mystery_3/index.html
  · steps.0  request  … ms
  · steps.1  extract links  … ms
  ⇢ page 1  https://books.toscrape.com/catalogue/sharp-objects_997/index.html
    · steps.2.steps.0  request  … ms
    · steps.2.steps.1  extract title  … ms
    · steps.2.steps.2  extract upc  … ms
  ✚ record ["https://books.toscrape.com/catalogue/sharp-objects_997/index.html"]
  ⇢ page 1  https://books.toscrape.com/catalogue/in-a-dark-dark-wood_963/index.html
    · steps.2.steps.0  request  … ms
    · steps.2.steps.1  extract title  … ms
    · steps.2.steps.2  extract upc  … ms
  ✚ record ["https://books.toscrape.com/catalogue/in-a-dark-dark-wood_963/index.html"]
  ⇢ page 1  https://books.toscrape.com/catalogue/the-past-never-ends_942/index.html
    · steps.2.steps.0  request  … ms
    · steps.2.steps.1  extract title  … ms
    · steps.2.steps.2  extract upc  … ms
  ✚ record ["https://books.toscrape.com/catalogue/the-past-never-ends_942/index.html"]
  ⇢ page 1  https://books.toscrape.com/catalogue/a-murder-in-time_877/index.html
    · steps.2.steps.0  request  … ms
    · steps.2.steps.1  extract title  … ms
    · steps.2.steps.2  extract upc  … ms
  ✚ record ["https://books.toscrape.com/catalogue/a-murder-in-time_877/index.html"]
  ⇢ page 1  https://books.toscrape.com/catalogue/the-murder-of-roger-ackroyd-hercule-poirot-4_852/index.html
    · steps.2.steps.0  request  … ms
    · steps.2.steps.1  extract title  … ms
    · steps.2.steps.2  extract upc  … ms
  ✚ record ["https://books.toscrape.com/catalogue/the-murder-of-roger-ackroyd-hercule-poirot-4_852/index.html"]
  ⇢ page 1  https://books.toscrape.com/catalogue/the-last-mile-amos-decker-2_754/index.html
    · steps.2.steps.0  request  … ms
    · steps.2.steps.1  extract title  … ms
    · steps.2.steps.2  extract upc  … ms
  ✚ record ["https://books.toscrape.com/catalogue/the-last-mile-amos-decker-2_754/index.html"]
  ⇢ page 1  https://books.toscrape.com/catalogue/that-darkness-gardiner-and-renner-1_743/index.html
    · steps.2.steps.0  request  … ms
    · steps.2.steps.1  extract title  … ms
    · steps.2.steps.2  extract upc  … ms
  ⇢ page 1  https://books.toscrape.com/catalogue/tastes-like-fear-di-marnie-rome-3_742/index.html
    · steps.2.steps.0  request  … ms
    · steps.2.steps.1  extract title  … ms
    · steps.2.steps.2  extract upc  … ms
  · steps.2  forEach  … ms
■ mystery-parallel: 6 emitted, 0 rejected, 0 duplicates, 9 pages, … ms
```
<!-- /capture -->

- **Iterations start in list order, as permits free up, and records come out in the order they finish.** Here
  that is list order again: every book page answered within the 300 ms `delayMs`, so no iteration overtook
  another. On a slower site a book whose page answers sooner is emitted before one listed above it.
- `delayMs` spaces **the start of every request** across the whole recipe run, whichever iteration sends it:
  three in flight at most, one new one every 300 ms at most.
- `maxRecords` stays exact. The 7th and 8th books were already being fetched when the 6th record came out: the
  trace shows their bodies run to the end with no `✚`, since their emits returned without producing a record,
  and no 9th iteration started. That is why the summary counts 9 pages for 6 records.
- The limit is per recipe run, not per loop. A loop nested inside a concurrent iteration runs its body one item
  at a time, so nesting never multiplies the number of requests in flight.
- A failure under the `fail` policy stops new iterations. The ones in flight finish, then the first failure
  stops the recipe.

In web mode each concurrent iteration gets its own **tab** in the recipe's browser context: the tabs share
cookies (the login), each has its own page, and each closes when its iteration ends. A tab opens blank, so the
body must start with a `goto`. A `forEach` over `selector` always runs one element at a time, since its elements
belong to one page. [authoring §3.9](../recipes/authoring.md#39-concurrency) and [part 10](09-running.md) cover
concurrency across recipes and per site.

## `paginate`

`paginate` runs its `steps` once per page, each page in a **fresh child scope**, and finds the next page after
each body. In the engine's own terms (`step-flow/paginate.use-case.ts`):

```text
number = the page number of the enclosing scope (1 at the start)
for count = 1, 2, …
  run the body in a new child scope whose page.number is `number` (with the cursor bound, if there is one)
  stop if the body reached limits.maxRecords
  stop if `until` renders truthy, rendered in the page's scope
  stop if count = maxPages
  ask for the next page; stop if there is none
  number = number + 1; remember the next page's URL (or the cursor) for the next round
```

Three consequences:

- **`until` is checked after the body.** The page it stops on is fully processed, and `until: "{{page.number}}"`
  stops after page 1, not before it.
- **`maxPages` has no default.** A `paginate` without `until` or `maxPages` runs until the site has no next page,
  which on an inert "next" link (visible, but going nowhere) is never.
- **Nothing on page N is visible on page N+1**, since each page's scope is dropped. To carry values across
  pages, `collect` them ([below](#cross-page-accumulation)).

How the next page is found depends on `next` and on the mode:

| `next` | Web mode | Api mode |
|---|---|---|
| `{ "selector": … }` | If the body navigated away, go back to the page the body started on. Take the first match; if it isn't visible within 2 s, there is no next page. Click it and wait for the page to load. | Refused at load: `next.selector needs a browser` |
| `{ "url": … }` | Render the template; an empty result means no next page. Otherwise `goto` it (relative URLs allowed). | Render; empty means no next page. Otherwise resolve it against `page.url` and **fetch nothing**: the next body must `request` `{{page.url}}` itself. |
| `{ "jsonpath": … }` | Read the first match in the JSON the page body's last `request` fetched. `undefined`, `null`, `""` and `false` mean no next page. Without `as` the value must be a URL (relative allowed); with `as`, it is bound under that name in the next page's scope and `page.url` doesn't change. | Same |

### Next by selector: clicking "next"

The recipe [`catalogue-click`](recipes/flow-paginate-click/catalogue-click.input.json) reads three pages of
[books.toscrape.com's catalogue](https://books.toscrape.com/catalogue/page-1.html) in a browser, and emits one
record per page:

```json
{ "type": "goto", "url": "{{start.url}}" },
{ "type": "paginate", "next": { "selector": "li.next a" }, "maxPages": 3, "steps": [
  { "type": "extract", "id": "titles", "selector": "article.product_pod h3 a", "kind": "css", "take": "attr:title", "many": true },
  { "type": "extract", "id": "pager", "selector": "li.current", "kind": "css" },
  { "type": "emit" }
]}
```

<!-- capture:flow-paginate-click screenshot alt=The_pager:_li.next_a_is_clicked_after_each_page -->
![The pager: li.next a is clicked after each page](../assets/how-it-works/flow-paginate-click.png)
<!-- /capture -->

<!-- capture:flow-paginate-click trace -->
```text
▶ catalogue-click (web)
  ⇄ access direct (direct)
  ↺ https://books.toscrape.com/catalogue/page-1.html: net::ERR_TOO_MANY_RETRIES, try 2 in … ms
  ⇢ page 1  https://books.toscrape.com/catalogue/page-1.html
  · steps.0  goto  … ms
    · steps.1.steps.0  extract titles  … ms
    · steps.1.steps.1  extract pager  … ms
  ✚ record [1]
    · steps.1.steps.2  emit  … ms
  ⇢ page 2  https://books.toscrape.com/catalogue/page-2.html
    · steps.1.steps.0  extract titles  … ms
    · steps.1.steps.1  extract pager  … ms
  ✚ record [2]
    · steps.1.steps.2  emit  … ms
  ⇢ page 3  https://books.toscrape.com/catalogue/page-3.html
    · steps.1.steps.0  extract titles  … ms
    · steps.1.steps.1  extract pager  … ms
  ✚ record [3]
    · steps.1.steps.2  emit  … ms
  · steps.1  paginate  … ms
■ catalogue-click: 3 emitted, 0 rejected, 0 duplicates, 3 pages, … ms
```
<!-- /capture -->

<!-- capture:flow-paginate-click records n=3 -->
```json
{"page":1,"url":"https://books.toscrape.com/catalogue/page-1.html","pager":"Page 1 of 50","books":20,"firstTitle":"A Light in the Attic"}
{"page":2,"url":"https://books.toscrape.com/catalogue/page-2.html","pager":"Page 2 of 50","books":20,"firstTitle":"In Her Wake"}
{"page":3,"url":"https://books.toscrape.com/catalogue/page-3.html","pager":"Page 3 of 50","books":20,"firstTitle":"Slow States of Collapse: Poems"}
```
<!-- /capture -->

Each click shows as a `⇢ page N` line between two runs of the body, and `page.number` counts the pages
(`Page 2 of 50` agrees). The run stops at `maxPages`, with 47 pages left. The URL each record carries is the
browser's real URL after the click: the web runner re-reads it after every step.

When the body leaves the listing (a `forEach` that does `goto {{link}}` on each product), the engine goes back
to the listing's URL before looking for "next". It can't restore anything else the body changed on that page (a
filter, a scroll position), so a listing that depends on them is better paged by URL.

### Next by URL template

[quotes.toscrape.com's API](https://quotes.toscrape.com/api/quotes?page=1) takes the page as a query parameter
and says whether there is another one. The recipe
[`quotes-api-pages`](recipes/flow-paginate-url/quotes-api-pages.input.json) starts at page 9 so the end comes
quickly:

```json
{ "type": "paginate", "next": { "url": "?page={{ list.page + 1 }}" }, "until": "{{ !list.has_next }}", "maxPages": 5, "steps": [
  { "type": "request", "id": "list", "url": "{{page.url}}" },
  { "type": "emit" }
]}
```

<!-- capture:flow-paginate-url trace -->
```text
▶ quotes-api-pages (api)
  ⇄ access direct (direct)
  ⇢ page 1  https://quotes.toscrape.com/api/quotes?page=9
    · steps.0.steps.0  request list  … ms
  ✚ record [9]
    · steps.0.steps.1  emit  … ms
  ⇢ page 2  https://quotes.toscrape.com/api/quotes?page=10
    · steps.0.steps.0  request list  … ms
  ✚ record [10]
    · steps.0.steps.1  emit  … ms
  · steps.0  paginate  … ms
■ quotes-api-pages: 2 emitted, 0 rejected, 0 duplicates, 2 pages, … ms
```
<!-- /capture -->

<!-- capture:flow-paginate-url records n=2 -->
```json
{"apiPage":9,"pageNumber":1,"url":"https://quotes.toscrape.com/api/quotes?page=9","quotes":10,"hasNext":true}
{"apiPage":10,"pageNumber":2,"url":"https://quotes.toscrape.com/api/quotes?page=10","quotes":10,"hasNext":false}
```
<!-- /capture -->

- In api mode `next.url` only computes the next URL. The `request` of `{{page.url}}` in the body is what fetches
  it: without it, every page's body would read the same first response (or nothing).
- The template is rendered in the finished page's scope, so it can read that page's response: `list.page + 1`,
  here `10`. `?page=10` is resolved against the current `page.url`, which keeps the path.
- `until` read `has_next: false` from page 10's response after its body ran, so page 10 was emitted and there
  was no page 11. `maxPages: 5` is the safety net that never fired. `apiPage` (the API's own count) and
  `pageNumber` (`page.number`, which starts at 1 whatever the start URL) differ.

### Next by JSONPath

[PokeAPI](https://pokeapi.co/api/v2/pokemon?limit=4) returns the URL of the next page in `next`. The recipe
[`pokeapi-next`](recipes/flow-paginate-cursor/pokeapi-next.input.json) follows it:

```json
{ "type": "paginate", "next": { "jsonpath": "$.next" }, "maxPages": 2, "steps": [
  { "type": "request", "id": "list", "url": "{{page.url}}" },
  { "type": "extract", "id": "results", "selector": "$.results[*]", "kind": "jsonpath", "take": "json", "many": true },
  { "type": "forEach", "over": "results", "as": "mon", "emit": true, "steps": [] }
]}
```

<!-- capture:flow-paginate-cursor trace -->
```text
▶ pokeapi-next (api)
  ⇄ access direct (direct)
  ⇢ page 1  https://pokeapi.co/api/v2/pokemon?limit=4
    · steps.0.steps.0  request list  … ms
    · steps.0.steps.1  extract results  … ms
  ✚ record ["bulbasaur"]
  ✚ record ["ivysaur"]
  ✚ record ["venusaur"]
  ✚ record ["charmander"]
    · steps.0.steps.2  forEach  … ms
  ⇢ page 2  https://pokeapi.co/api/v2/pokemon?offset=4&limit=4
    · steps.0.steps.0  request list  … ms
    · steps.0.steps.1  extract results  … ms
  ✚ record ["charmeleon"]
  ✚ record ["charizard"]
  ✚ record ["squirtle"]
  ✚ record ["wartortle"]
    · steps.0.steps.2  forEach  … ms
  · steps.0  paginate  … ms
■ pokeapi-next: 8 emitted, 0 rejected, 0 duplicates, 2 pages, … ms
```
<!-- /capture -->

`$.next` is read from the nearest JSON document, which should be the one the page's own `request` just fetched.
A page scope inherits its parent's document, so a body without a `request` would read the same enclosing
document, and the same `next`, on every page. With no JSON document at all, the step fails with
`next.jsonpath needs a JSON document from a request in the page body`. On its last page
PokeAPI's `next` is `null`, which would end pagination by itself; `maxPages: 2` stops this run first. Each
record's `page` is the page it came from:

<!-- capture:flow-paginate-cursor records n=5 -->
```json
{"name":"bulbasaur","url":"https://pokeapi.co/api/v2/pokemon/1/","page":1}
{"name":"ivysaur","url":"https://pokeapi.co/api/v2/pokemon/2/","page":1}
{"name":"venusaur","url":"https://pokeapi.co/api/v2/pokemon/3/","page":1}
{"name":"charmander","url":"https://pokeapi.co/api/v2/pokemon/4/","page":1}
{"name":"charmeleon","url":"https://pokeapi.co/api/v2/pokemon/5/","page":2}
```
<!-- /capture -->

An API that returns an opaque cursor instead of a URL (`"after": "c2Vjb25k"`) needs `as`: the value is bound in
the next page's scope, and the body builds the URL itself. The next example does that.

### Cross-page accumulation

Page scopes are dropped, so a value found on page 1 is gone on page 2. To keep values across pages, bind a list
**before** the `paginate` and `collect` into it inside. The recipe
[`pokeapi-cursor`](recipes/flow-accumulate/pokeapi-cursor.input.json) reads three pages of five names, with the
next URL bound as a cursor, and emits a single record once pagination ends:

```json
{ "type": "set", "id": "names", "value": [] },
{ "type": "paginate", "next": { "jsonpath": "$.next", "as": "cursor" }, "maxPages": 3, "steps": [
  { "type": "request", "id": "list", "url": "{{ cursor ?? start.url }}" },
  { "type": "extract", "id": "batch", "selector": "$.results[*].name", "kind": "jsonpath", "many": true },
  { "type": "collect", "into": "names", "value": "{{batch}}" }
]},
{ "type": "set", "id": "count", "value": "{{ len(names) }}" },
{ "type": "emit" }
```

<!-- capture:flow-accumulate trace -->
```text
▶ pokeapi-cursor (api)
  ⇄ access direct (direct)
  · steps.0  set names  … ms
  ⇢ page 1  https://pokeapi.co/api/v2/pokemon?offset=20&limit=5
    · steps.1.steps.0  request list  … ms
    · steps.1.steps.1  extract batch  … ms
    · steps.1.steps.2  collect  … ms
  ⇢ page 2  https://pokeapi.co/api/v2/pokemon?offset=25&limit=5
    · steps.1.steps.0  request list  … ms
    · steps.1.steps.1  extract batch  … ms
    · steps.1.steps.2  collect  … ms
  ⇢ page 3  https://pokeapi.co/api/v2/pokemon?offset=30&limit=5
    · steps.1.steps.0  request list  … ms
    · steps.1.steps.1  extract batch  … ms
    · steps.1.steps.2  collect  … ms
  · steps.1  paginate  … ms
  · steps.2  set count  … ms
  ✚ record (no key)
  · steps.3  emit  … ms
■ pokeapi-cursor: 1 emitted, 0 rejected, 0 duplicates, 3 pages, … ms
```
<!-- /capture -->

<!-- capture:flow-accumulate record -->
```json
{
  "count": 15,
  "names": [
    "spearow",
    "fearow",
    "ekans",
    "… 12 more"
  ],
  "pagesRead": 3,
  "pageUrl": "https://pokeapi.co/api/v2/pokemon?offset=20&limit=5"
}
```
<!-- /capture -->

- `cursor` is unset on page 1, so `{{ cursor ?? start.url }}` requests the start URL; on pages 2 and 3 it holds
  PokeAPI's `next`.
- `collect` appends a list item by item: three `batch`es of five make fifteen names, not three lists.
- `names` was bound in the recipe's top scope, so it outlives every page. Without the `set`, the loader refuses
  the recipe (`"names" is not a known id: set it to [] before the loop that collects into it`).
- After `paginate`, the enclosing scope's `page.number` is the last page's (`pagesRead: 3`). `page.url` is still
  the start URL: with `as` the next page is a value, not a URL, and each page's `request` set `page.url` in the
  page's own scope, which is gone.

The list lives in memory until the recipe ends: fine for thousands of values. To emit as you go instead, put
the `forEach` inside the `paginate` body, as the previous example does.

## `if`, `collect` and `emit`

`if` renders its `test` and runs `steps` when it is truthy, `else` otherwise. It opens **no scope**: whatever a
branch binds is visible after the `if`. The recipe [`quotes-if`](recipes/flow-if/quotes-if.input.json) labels
each quote on [page 3 of the API](https://quotes.toscrape.com/api/quotes?page=3), where one quote has no tags,
and emits every quote except Einstein's with an explicit `emit`:

```json
{ "type": "forEach", "over": "quotes", "as": "quote", "steps": [
  { "type": "if", "test": "{{ len(quote.tags) == 0 }}", "steps": [
    { "type": "set", "id": "label", "value": "untagged" }
  ], "else": [
    { "type": "set", "id": "label", "value": "{{ join(quote.tags, ', ') }}" }
  ]},
  { "type": "emit", "when": "{{ quote.author.name != 'Albert Einstein' }}" }
]}
```

<!-- capture:flow-if trace lines=10 -->
```text
▶ quotes-if (api)
  ⇄ access direct (direct)
  ⇢ page 1  https://quotes.toscrape.com/api/quotes?page=3
  · steps.0  request list  … ms
  · steps.1  extract quotes  … ms
    ⑂ steps.2.steps.0  else
      · steps.2.steps.0.else.0  set label  … ms
    · steps.2.steps.0  if  … ms
  ✚ record ["“I love you without knowing how, or when, or from where. I love you simply, without problems or pride: I love you in this way because I do not know any other way of loving but this, in which there is no I or you, so intimate that your hand upon my chest is my hand, so intimate that when I fall asleep your eyes close.”"]
    · steps.2.steps.1  emit  … ms
  …
```
<!-- /capture -->

Every quote with tags goes through `else`, like the first one. The only `then` in the run is J.K. Rowling's
untagged quote:

<!-- capture:flow-if trace grep=⑂.*then|steps.2.steps.0.steps.0|✚_record_\["“It_is lines=3 -->
```text
    ⑂ steps.2.steps.0  then
      · steps.2.steps.0.steps.0  set label  … ms
  ✚ record ["“It is impossible to live without failing at something, unless you live so cautiously that you might as well not have lived at all - in which case, you fail by default.”"]
```
<!-- /capture -->

<!-- capture:flow-if record record=6 -->
```json
{
  "text": "“It is impossible to live without failing at something, unless you live so cautiously that you might as well not have lived at all - in which case, you fail …",
  "author": "J.K. Rowling",
  "label": "untagged",
  "firstTag": null
}
```
<!-- /capture -->

<!-- capture:flow-if summary -->
```text
quotes-if: 8 emitted, 0 rejected, 0 duplicates, 1 pages
```
<!-- /capture -->

- `⑂ steps.2.steps.0  then` and `else` name the branch. Branch paths end in `.steps.N` or `.else.N`.
- Both branches bind `label`, and the loader accepts that: they never both run, so the id is bound once on each
  path. The `emit` after the `if` sees whichever ran.
- `test` uses recipe truthiness: `false`, `0`, `null`, missing, an empty list, and the texts `""`, `"false"`,
  `"0"`, `"null"` and `"undefined"` are false ([part 6](05-templates-and-scope.md)).
- 8 records from 10 quotes: `when` skipped the `emit` for the two Einstein quotes, silently (a step skipped by
  `when` prints no trace line). `when` works on any step and skips that step alone; `if` chooses between two
  lists.

`emit` produces a record from **everything visible in the scope where it runs**: the iteration's values, then
each enclosing scope's, then `page`, `vars` and `start`. The snapshot is taken at the moment of the `emit`, so
later steps cannot change it. An `emit` step inside a non-emitting `forEach` is the same as `emit: true` on the
loop, except that it can be conditional, as here, or placed in one branch of an `if` (each branch counts as its
own path for the one-emit rule).

`collect` appends `value` (rendered like `set`) to the list `into` names, in whichever enclosing scope binds it.
A list is appended item by item, and a missing value appends nothing. It is the only way a value leaves a
`forEach` iteration or a `paginate` page: see [`seen`](#foreach) and [`names`](#cross-page-accumulation) above.

## Error policies

A step that throws (an extract with no match, a request that gets a 404, a `goto` that times out) goes through
its error policy: the step's `onError`, else the recipe's `onError`, else `fail`.

| Policy | What happens | Trace |
|---|---|---|
| `{ "policy": "fail" }` (default) | The step fails as `step <path> (<type>) failed: <cause>`. The recipe stops, and its report carries the error: a failure is reported, never thrown by `run`. | `✖` |
| `{ "policy": "skip" }` | The walk goes on with the next step. A skipped extract or request leaves its id unbound. | `↷` |
| `{ "policy": "retry", "attempts": 3, "backoffMs": 500 }` | The step runs again, up to `attempts` times in all (1 to 20), waiting `backoffMs × (n − 1)` before attempt `n`: 500 ms, then 1000 ms. When the last attempt fails, the step fails as under `fail`, not `skip`. | `↻` |

### `skip`

The recipe [`quotes-skip`](recipes/flow-onerror-skip/quotes-skip.input.json) reads the first tag of each quote
on page 3 with `onError: { "policy": "skip" }` on that extract alone:

<!-- capture:flow-onerror-skip trace grep=↷|It_is_impossible|✚_record_\["“Logic|■ lines=4 -->
```text
    ↷ steps.2.steps.1  extract firstTag  skipped: no match for $.tags[0]
  ✚ record ["“It is impossible to live without failing at something, unless you live so cautiously that you might as well not have lived at all - in which case, you fail by default.”"]
  ✚ record ["“Logic will get you from A to Z; imagination will get you everywhere.”"]
■ quotes-skip: 10 emitted, 0 rejected, 0 duplicates, 1 steps skipped, 1 pages, … ms
```
<!-- /capture -->

<!-- capture:flow-onerror-skip record record=7 -->
```json
{
  "text": "“It is impossible to live without failing at something, unless you live so cautiously that you might as well not have lived at all - in which case, you fail …",
  "author": "J.K. Rowling",
  "label": null,
  "firstTag": null
}
```
<!-- /capture -->

The quote without tags gets `firstTag: null` (the field is `nullable`, and a missing optional field becomes
`null`: [part 9](08-policies.md)), and the next quote is read as usual. The recipe's summary counts the skipped
step.

### `retry`

The recipe [`pokeapi-missing`](recipes/flow-onerror-retry/pokeapi-missing.input.json) asks PokeAPI for a Pokémon
that doesn't exist, with `onError: { "policy": "retry", "attempts": 3, "backoffMs": 500 }` on the request:

<!-- capture:flow-onerror-retry trace -->
```text
▶ pokeapi-missing (api)
  ⇄ access direct (direct)
  ⇢ page 1  https://pokeapi.co/api/v2/pokemon/missingno  [404]
  ↻ steps.0  request mon  retry 2: HTTP 404 for https://pokeapi.co/api/v2/pokemon/missingno
  ⇢ page 1  https://pokeapi.co/api/v2/pokemon/missingno  [404]
  ↻ steps.0  request mon  retry 3: HTTP 404 for https://pokeapi.co/api/v2/pokemon/missingno
  ⇢ page 1  https://pokeapi.co/api/v2/pokemon/missingno  [404]
  ✖ step steps.0 (request) failed: HTTP 404 for https://pokeapi.co/api/v2/pokemon/missingno
■ pokeapi-missing: 0 emitted, 0 rejected, 0 duplicates, 3 pages, … ms
  ✖ stopped: step steps.0 (request) failed: HTTP 404 for https://pokeapi.co/api/v2/pokemon/missingno
```
<!-- /capture -->

A step retry runs the whole step again: three requests, three `⇢ … [404]` lines, and the recipe stops after the
third. A 404 is a client error, so retrying doesn't help here: `retry` is for failures that come and go (an
element that shows late, a flaky endpoint). It sits above the transport retry, which already re-sends a request
on a dropped connection or a 408, 425, 429, 500, 502, 503 or 504 with exponential backoff
([part 10](09-running.md)). Each step attempt gets its own transport retries.

### The trap: an outer `onError` doesn't catch inner steps

`onError` belongs to the step it's written on. On a `forEach`, `paginate` or `if` it covers that step's own
failures, not the failures of the steps in its body: those have already gone through their own policy (or the
recipe's) by the time they reach the loop, and they pass through it untouched. The recipe
[`quotes-outer-skip`](recipes/flow-onerror-trap/quotes-outer-skip.input.json) is `quotes-skip` with the `skip`
moved to the loop:

```json
{ "type": "forEach", "over": "quotes", "as": "quote", "emit": true, "onError": { "policy": "skip" }, "steps": [
  { "type": "extract", "id": "author", "from": "quote", "selector": "$.author.name", "kind": "jsonpath" },
  { "type": "extract", "id": "firstTag", "from": "quote", "selector": "$.tags[0]", "kind": "jsonpath" }
]}
```

<!-- capture:flow-onerror-trap trace grep=fairy|✖ -->
```text
  ✚ record ["“If you want your children to be intelligent, read them fairy tales. If you want them to be more intelligent, read them more fairy tales.”"]
  ✖ step steps.2.steps.1 (extract) failed: no match for $.tags[0]
■ quotes-outer-skip: 7 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
  ✖ stopped: step steps.2.steps.1 (extract) failed: no match for $.tags[0]
```
<!-- /capture -->

Seven records, then the extract's `fail` (the default) stops the recipe at the eighth quote, `skip` on the loop
notwithstanding. To tolerate a failure inside a loop, put `onError` on the inner step, or set `onError` on the
recipe, which every step without its own policy uses.

Two more consequences of policies on control steps:

- **Retrying a control step re-runs its whole body**, emits included: a `forEach` retried after a failure emits
  its earlier records again. De-duplication drops them only when the output has key fields.
- **A mapping failure fails the emitting step.** An emitting `forEach` whose record can't be mapped fails under
  the `forEach`'s policy, and `skip` there skips the rest of the loop, not just that record. Use the mapping's
  own policies for that ([part 9](08-policies.md)).

## `limits.maxRecords`

`limits.maxRecords` stops the walk cleanly once that many records have been emitted. The recipe
[`catalogue-first-five`](recipes/flow-maxrecords/catalogue-first-five.input.json) would page through ten pages
of the catalogue, but stops at five books:

```json
"limits": { "delayMs": 300, "maxRecords": 5 },
"steps": [
  { "type": "paginate", "next": { "url": "page-{{ page.number + 1 }}.html" }, "maxPages": 10, "steps": [
    { "type": "request", "url": "{{page.url}}" },
    { "type": "extract", "id": "titles", "selector": "article.product_pod h3 a", "kind": "css", "take": "attr:title", "many": true },
    { "type": "forEach", "over": "titles", "as": "title", "emit": true, "steps": [] }
  ]}
]
```

<!-- capture:flow-maxrecords trace -->
```text
▶ catalogue-first-five (api)
  ⇄ access direct (direct)
  ⇢ page 1  https://books.toscrape.com/catalogue/page-1.html
    · steps.0.steps.0  request  … ms
    · steps.0.steps.1  extract titles  … ms
  ✚ record ["A Light in the Attic"]
  ✚ record ["Tipping the Velvet"]
  ✚ record ["Soumission"]
  ✚ record ["Sharp Objects"]
  ✚ record ["Sapiens: A Brief History of Humankind"]
    · steps.0.steps.2  forEach  … ms
  · steps.0  paginate  … ms
■ catalogue-first-five: 5 emitted, 0 rejected, 0 duplicates, 1 pages, … ms
```
<!-- /capture -->

The trace ends on page 1. After the fifth `✚`, the loop and `paginate` finish at once (their `·` lines), and no
`⇢ page 2` follows, though fifteen titles of page 1 and nine more pages were left.

- After each record, the engine compares the count with the limit. At the limit, the emit tells the step that
  called it to stop, and the stop travels up through `forEach`, `paginate` and `if` to the recipe, which ends as
  if it had run out of steps: no error, no next page, no next start URL.
- Only emitted records count. Rejected records and duplicates don't, so a run with many duplicates reads more
  pages to reach its limit.
- With concurrent iterations the count is still exact: iterations in flight finish, but their emits produce
  nothing.

Next: [6. Templates and scope](05-templates-and-scope.md).
