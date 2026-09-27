<p align="center">
  <img src="https://raw.githubusercontent.com/russoedu/open.craw/main/docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# Examples

Every example is a folder you can copy anywhere and run: its own `package.json` (the published `@opencraw`
packages), its recipes, a runner, and a README explaining why the recipes look the way they do.

```sh
cp -r examples/shop ~/my-crawler && cd ~/my-crawler
npm install
npm run setup     # only the examples that drive a browser have it
npm start
```

**In this repository** there's no need to install anything per example: build the packages once at the root
(`npm run build`), then `npm start` in any example folder uses them. In VS Code, the `examples` group of the
Run and Debug view runs and debugs each one.

## Start here

| Example | Runs against | Mode | What it shows |
|---|---|---|---|
| [shop](./shop) | a local site it starts itself | web + api | The starting point, fully offline. One shop crawled in a browser and through its JSON API after a login: `paginate` by a link and by a URL in the response, `forEach`, a `session.bootstrap` login, a hook, several sources for one field, deduplication by key across recipes. Has tests. |

## Real sites

| Example | Runs against | Mode | What it shows |
|---|---|---|---|
| [movies](./movies) | Netflix, IMDb | api + web | Data from JSON-LD blocks read with `jsonpath`, `limits.maxRecords`, a scalar coerced into an array, a site behind a WAF. |
| [filmography](./filmography) | TMDB, Letterboxd | api | Navigation from page to page: relative `request` URLs, `forEach` over table rows and grid items, one attribute split into two fields, nullable fields, and a shifted-field bug with its fix. |
| [vehicles](./vehicles) | BYD UK, Kia UK | api | Configurator data behind an inline JSON URL, three pages joined per model, nested loops emitting one record per priced combination, rejects by policy. |
| [captcha-solver](./captcha-solver) | a local challenge and a fake API; Google's reCAPTCHA demo with a key | web | A `CaptchaSolver` plugin for CapSolver: `session.captcha`, verification, the solve count. Has tests. |

## Documents

| Example | Runs against | Mode | What it shows |
|---|---|---|---|
| [stellantis-it-discounts](./stellantis-it-discounts) | monthly PDFs | api (cli) | Tables read from PDFs: cells wrapped over several lines, columns that move, a header that differs, footnotes, a month that breaks the template. The recipes run with the `opencraw` cli, no code. |

## A deployable service

[apps/azure-host](../apps/azure-host) is a complete Azure Functions app serving OpenCraw over HTTP, with two
recipe sets for books.toscrape.com, a Dockerfile and a deploy script.

## How they're checked

- On every pull request, CI loads and binds every recipe here (`npm run examples:check`) and runs the examples
  that need no outside site (`npm run examples:test`).
- Weekly, and on demand, the [examples-live](../.github/workflows/examples-live.yml) workflow copies each
  example out of the repository, installs it from npm and runs it against its real sources. Sites change: a
  red run there means a recipe needs updating, not that the engine broke.
