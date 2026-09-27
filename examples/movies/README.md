<p align="center">
  <img src="https://raw.githubusercontent.com/russoedu/open.craw/main/docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# Movies from Netflix and IMDb

One output, two sources, five records each: a check that the recipe model holds up on real sites. Netflix is
read without a browser, from the structured data its public pages carry; IMDb is read in a browser.

## Run it

```sh
npm install
npm run setup                  # the browser, for IMDb only
npm start                      # both sources
npm start -- --only netflix    # no browser needed
npm start -- --only imdb
npm start -- --trace           # also print the route: pages, steps, records
```

In the OpenCraw repository, skip `npm install`: build the packages once at the root (`npm run core:build`) and
the example uses them. Records land in `out/movies.jsonl`. Change `limits.maxRecords` in an input recipe to
crawl more. The run exits with an error when a recipe stops or nothing is written, so a site change is noticed.

IMDb is behind AWS WAF: a plain HTTP client gets a "Human Verification" challenge, and so does any browser
from a flagged IP (cloud machines, CI runners). From a normal machine it works.

## What's in it

| File | What it does |
|---|---|
| `movie.output.json` | `title`, `genres`, `actors`, plus generated `source`, `url`, `scrapedAt`. `title` + `source` is the key. |
| `netflix-movies.input.json` | **api mode.** Netflix's public "Movies" genre page carries a JSON-LD `ItemList` of titles; each title page carries JSON-LD with `name`, `genre` and `actors`. No browser, no login. |
| `imdb-top.input.json` | **web mode.** The Top 250 chart in a real browser, then each title page's JSON-LD (`name`, `genre`, `actor`). |
| `run.mjs` | Loads the recipes, runs them, prints one line per record. |

## How the recipes were written

The decisions behind the recipes, and what happened when they first ran. The
[authoring guide](https://github.com/russoedu/open.craw/blob/main/docs/recipes/authoring.md) says what each key means.

**Output** (`movie.output.json`): `title`, `genres` (array), `actors` (array), plus generated `source`,
`url`, `scrapedAt`. Key: `title` + `source`, so the same film from two sites stays two records.

### Netflix, api mode

Probing first: Netflix's public genre page `https://www.netflix.com/browse/genre/34399` ("Movies") is
served without login and contains one `<script type="application/ld+json">` holding an `ItemList` of 680
`{ "@type": "Movie", "name", "url": "https://www.netflix.com/title/<id>" }`. Each title page contains one
JSON-LD block with `name`, `genre` (a single string) and `actors[].name`. No browser needed.

The route, as ids:

```text
request  listing     {{start.url}}                                   the genre page
extract  listing_ld  script[type="application/ld+json"], many        JSON texts
extract  items       from listing_ld  $[*].itemListElement[*].item   680 { name, url }
forEach  items as item, emit
  request detail     {{item.url}}
  extract detail_ld  script[...ld+json], many
  extract name       from detail_ld  $[*].name
  extract genre      from detail_ld  $[*].genre        onError: skip
  extract actors     from detail_ld  $[*].actors[*].name, many
```

Decisions:

- `limits.maxRecords: 5` stops the `forEach` after five records; the other 675 items are never fetched.
- `delayMs: 1000` between requests: politeness costs nothing at this size.
- `genre` is a string on Netflix; the output field is an `array`, and coercion wraps a scalar. Same output
  as IMDb's array without a transform.
- `genre` has `onError: skip` because a title page without a genre is plausible; `name` and `actors` do not,
  so a markup change fails loudly instead of producing empty records.

Result, verified:

```text
netflix  | The Ministry of Ungentlemanly Warfare | Comedies | Henry Cavill, Eiza González, Alan Ritchson, Alex Pettyfer
netflix  | Puss in Boots: The Last Wish          | Comedies | Antonio Banderas, Salma Hayek Pinault, Harvey Guillén, Florence Pugh
netflix  | The Hitman's Bodyguard                | Comedies | Ryan Reynolds, Samuel L. Jackson, Gary Oldman, Salma Hayek
netflix  | National Security                     | Comedies | Martin Lawrence, Steve Zahn, Colm Feore, Bill Duke
netflix  | Ride Along 2                          | Comedies | Ice Cube, Kevin Hart, Tika Sumpter, Benjamin Bratt
  netflix: 5 emitted, 0 rejected, 6 pages, 11342 ms
```

### IMDb, web mode

Every request to IMDb from the sandbox, with a real browser included, answered `202` with
`x-amzn-waf-action: challenge` and a "Human Verification" page: AWS WAF flags the egress IP. Nothing in a
recipe fixes that, so the recipe is written for a normal machine: `goto` the Top 250 chart, `wait` for
`a.ipc-title-link-wrapper`, extract every `href`, then per link `goto` the title page and read its JSON-LD
(`$[*].name`, `$[*].genre`, `$[*].actor[*].name`). IMDb entity-escapes apostrophes inside JSON-LD, so the
title mapping carries `replace &apos; → '`. When the engine cannot pass the wall it reports the recipe as
stopped at `steps.1 (wait)` and moves on; the run does not crash.

### What this example changed in the engine

Both sites put their data in JSON-LD *text*. A `jsonpath` extract now parses text, and a list of texts
(every JSON-LD block, extracted with `many`) becomes an array of the entries that parse, so
`$[*].actors[*].name` finds the right block wherever it sits.
