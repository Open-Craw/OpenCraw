<p align="center">
  <img src="https://raw.githubusercontent.com/Open-Craw/OpenCraw/main/docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# A CapSolver captcha solver, end to end

`capsolver.mjs` is a working `CaptchaSolver` for [CapSolver](https://docs.capsolver.com). It sits outside
`@opencraw/core` on purpose: the engine defines the seam, and which paid service you use is your choice.
Copy it, or write one for another service in the same shape.

The example runs a real crawl with it, in one of two ways:

- **Without a key (the default):** a local search page puts a reCAPTCHA-shaped challenge in front of its
  results, and a fake CapSolver API on your machine hands out the token that page accepts. The whole solve
  happens and nothing leaves the machine: the engine spots the widget, the solver sends the task and polls, the
  token goes into the page, the page lets the crawl through.
- **With `CAPSOLVER_KEY`:** the real CapSolver solves the challenge on
  [Google's reCAPTCHA demo page](https://www.google.com/recaptcha/api2/demo), which exists for testing
  integrations. Each run costs one solve. This mode isn't run in CI.

Solving a captcha can break a site's terms. Read [Captchas: first, should you?](https://github.com/Open-Craw/OpenCraw/blob/main/docs/recipes/captcha.md#first-should-you)
before pointing a solver at a real site.

## Run it

```sh
npm install
npm run setup                    # the browser Playwright drives, once
npm start                        # the local demo
CAPSOLVER_KEY=CAP-... npm start  # the real CapSolver on Google's demo page
npm test                         # the solver's unit tests and the local demo, checked
```

In the OpenCraw repository, skip `npm install`: build the packages once at the root (`npm run core:build`) and
the example uses them.

```text
No CAPSOLVER_KEY: running the local demo (a fake reCAPTCHA page and a fake CapSolver API).
▶ local-search (web)
  ⚿ captcha recaptcha-v2 on http://127.0.0.1:4581/search?q=rain
  ✓ captcha solved by capsolver (attempt 1, 325 ms)
■ local-search: 3 emitted, 0 rejected, 0 duplicates, 1 pages, 784 ms

3 records written to …/examples/captcha-solver/out/search-results.jsonl
  captchas: 1 detected, 1 solved, 0 failed (fake API)
```

## What's in it

| File | What it does |
|---|---|
| `capsolver.mjs` | The solver. |
| `local-search.input.json`, `search-result.output.json` | The demo recipe. `session.captcha` names the solver and says how to tell it worked (`verify.selector: "#results"`); the steps don't mention the captcha at all. |
| `recaptcha-demo.input.json`, `recaptcha-demo.output.json` | The live recipe: open Google's demo, and once `.recaptcha-success` shows, emit its message. |
| `site.mjs` | The demo's search page (`127.0.0.1:4581`) and the fake CapSolver API (`createTask`, `getTaskResult`). |
| `crawl.mjs` | Picks the mode from the key, starts what the demo needs, runs the crawl. |
| `capsolver.test.mjs`, `crawl.test.mjs` | The solver's tests (the API faked, the page part in a real Chromium) and the demo end to end. |

## The solver

| Challenge (`kind`) | CapSolver task | Applied as |
|---|---|---|
| `recaptcha-v2` | `ReCaptchaV2TaskProxyLess` (`ReCaptchaV2Task` with `useProxy`) | `g-recaptcha-response`, then the widget's `data-callback` or its form's submit |
| `recaptcha-v3` | `ReCaptchaV3TaskProxyLess`, `pageAction` from `data-action` (default `verify`) | same |
| `turnstile` | `AntiTurnstileTaskProxyLess` | `cf-turnstile-response`, then callback or submit |
| `image` | `ImageToTextTask`, a screenshot of the image | typed into `imageInput`, then Enter |
| `hcaptcha`, `unknown` | – | fails: register another solver |

Task types and prices change; check CapSolver's documentation before relying on one.

## Use it in your own crawls

Copy `capsolver.mjs` next to your recipes, then register it: in code,
`createCrawler({ captchaSolvers: [capsolver({ apiKey })] })`, or for the cli, in a plugins module:

```js
// plugins.mjs
import { capsolver } from './capsolver.mjs'
export const captchaSolvers = [capsolver({ apiKey: process.env.CAPSOLVER_KEY })]
```

```sh
CAPSOLVER_KEY=... opencraw run recipes/ --plugins plugins.mjs
```

A recipe names it:

```json
"session": { "captcha": { "solver": "capsolver", "verify": { "selector": "#results" }, "maxSolves": 5 } }
```

| Option | Default | |
|---|---|---|
| `apiKey` | | Required. |
| `name` | `capsolver` | The name recipes use. |
| `useProxy` | `false` | Solve through the run's proxy (the access lease). CapSolver's workers must reach it, so it works with a provider's proxy, not a local one. |
| `imageInput` | | Where an image captcha's text goes. |
| `pollMs` | `3000` | How often to ask for the result. |
| `api` | `https://api.capsolver.com` | The API's base URL; the demo points it at the fake one. |
| `fetch` | global `fetch` | The fetch to use. |

The engine aborts the solve (`signal`) after `session.captcha.timeoutMs`, so a stuck task stops polling. The
whole flow (detection, verification, retries, rotation, the solve budget) is in
[docs/recipes/captcha.md](https://github.com/Open-Craw/OpenCraw/blob/main/docs/recipes/captcha.md).
