<p align="center">
  <img src="https://raw.githubusercontent.com/Open-Craw/OpenCraw/main/docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# One shop, two routes: a browser and a JSON API

A small shop runs on your machine (`site.mjs`): three catalog pages of two products each, a login form, and a
JSON API behind that login. Two input recipes read the same six products into one `product` output:

- **`shop-web`** walks the catalog in a browser and opens each product page;
- **`shop-api`** logs in with a browser once, keeps the session cookie, and reads the paged API over plain HTTP.

It's the starting point for writing recipes: everything runs offline, and every part of the route can be
opened in a browser (`npm run site`).

## Run it

```sh
npm install
npm run setup                 # the browser Playwright drives, once
npm start                     # both recipes
npm start -- --only api       # or --only web
npm start -- --trace          # also print the route: pages, steps, records
npm test                      # the same runs, with the records checked
```

In the OpenCraw repository, skip `npm install`: build the packages once at the root (`npm run core:build`) and
the example uses them.

```text
shop-web  | Trail runner  |     40 EUR | in stock
shop-web  | Rain shell    |   55.5 EUR | in stock
...
6 records written to …/examples/shop/out/products.jsonl
  shop-web: 6 emitted, 0 duplicates, 0 rejected, 9 pages, 3724 ms
  shop-api: 0 emitted, 6 duplicates, 0 rejected, 4 pages, 277 ms
```

`shop-api` emits nothing when both run: it finds the same six products, and the output's key (`url`) makes
them duplicates of `shop-web`'s. Run it alone (`--only api`) to see its six.

One record (`out/products.jsonl`, one JSON object per line):

```json
{"url":"http://127.0.0.1:4580/product/11","title":"Trail runner","price":{"amount":40,"currency":"EUR"},"inStock":true,"images":["http://127.0.0.1:4580/img/11-1.jpg","https://cdn.example/11-2.jpg"],"variants":[{"size":"M","price":{"amount":40,"currency":"EUR"}},{"size":"L","price":{"amount":45.5,"currency":"EUR"}}],"seller":{"name":"Northwind"},"scrapedAt":"2026-09-27T15:31:44.677Z","_source":{"recipeId":"shop-web","url":"http://127.0.0.1:4580/product/11","emittedAt":"2026-09-27T15:31:44.677Z"}}
```

## What's in it

| File | What it does |
|---|---|
| `product.output.json` | The record: `url` (the key), `title`, `price` (EUR), `inStock`, `images`, `variants` (size and price each), `seller.name`, and a generated `scrapedAt`. |
| `shop-web.input.json` | **web mode.** `paginate` follows the "Next page" link; on each catalog page `extract` takes every product link, and `forEach` opens each one and extracts its fields. |
| `shop-api.input.json` | **api mode.** `session.bootstrap` logs in with a browser and keeps only the cookies; then `paginate` follows the API's `nextPage` and `forEach` emits one record per item. |
| `site.mjs` | The shop, on `127.0.0.1:4580`. Log in as `demo` / `demo`. |
| `shop.mjs` | Starts the shop, runs the recipes, stops it. `run.mjs` and `shop.test.mjs` use it. |

## How the two routes reach the same record

The same field comes from different raw values on each route, and the mapping evens them out:

| Field | Web page | API item | Transforms |
|---|---|---|---|
| `title` | `<h1>  Trail runner  </h1>` | `"name": "Trail runner"` | web: `trim` |
| `price` | `Price: 40,00 €` | `"priceInt": 40, "priceCents": "00"` | web: `regex` for the number, then `currency` with `de-DE`; api: `join` the two parts with `.`, then `currency` |
| `inStock` | `<p class="stock">In stock</p>`, or nothing | `"stock": 3` | web: `boolean` with `truthy: ["in stock", "available"]`, and the output's `default: false` when the line is missing; api: `integer`, then the `positive` hook (registered in `shop.mjs`) |
| `images` | `src="/img/11-1.jpg"` (relative) | absolute URLs | web: `absoluteUrl` against the page, then `unique` |
| `variants` | table rows as HTML | a list of objects | web: `each` over the rows, with a `regex` per cell; api: `each` over the list |

## Features it shows

`paginate` (by a link, and by a URL in the response), `forEach`, `extract` of one and many, a login in
`session.bootstrap`, both modes, several sources for one field, `each`, a hook, the output's `default`, and
deduplication by key across recipes.
