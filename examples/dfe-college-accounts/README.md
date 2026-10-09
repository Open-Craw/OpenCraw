<p align="center">
  <img src="https://raw.githubusercontent.com/Open-Craw/OpenCraw/main/docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# A table on a PowerPoint slide: a college's student numbers

The Department for Education's
[College management accounts good practice guide](https://www.gov.uk/government/publications/college-management-accounts-good-practice-guide)
comes with a model board pack as a PowerPoint deck: 13 slides, 10 tables, one chart. This example reads the
student numbers table on the slide titled "Student Numbers": one record per programme, with its budget,
forecast and RAG rating.

The figures are illustrative. The deck is a template for a fictional college ("Weatherbury College", years written
`202X`); what's real is the shape a board pack takes, which is what a recipe has to handle.

## Run it

```sh
npm install
npm start                   # the copy shipped in this folder: offline
npm run live                # the original, from the URL in the recipe's start
npm start -- --trace        # also print the route: steps, records
npm test                    # the shipped copy, with the records checked
```

In the OpenCraw repository, skip `npm install`: build the packages once at the root (`npm run core:build`) and
the example uses them. No browser is needed.

The recipe's `start` is the document's real URL. `npm start` swaps in the shipped copy (`crawl.mjs` does it,
in memory), so the example runs anywhere and its output never changes; `npm run live` reads the original.

```text
16-19 students               | budget  2710 | forecast  2790 | Green
ASF (including devolved)     | budget  1230 | forecast  1150 | Red
...
7 records written to …/examples/dfe-college-accounts/out/student-numbers.jsonl (the shipped copy)
  dfe-student-numbers: 7 emitted, 0 rejected, 146 ms
```

```json
{"programme":"ASF (including devolved)","lastYearActual":1120,"currentActual":743,"budget":1230,"forecast":1150,"rag":"Red","implications":"Forecast shortfall of £139,000 in 202W/2X which is outside tolerances","slide":6}
```

## What's in it

| File | What it does |
|---|---|
| `management-accounts-model-march-2026.pptx` | The deck, as DfE published it in March 2026 (134 KB). |
| `student-numbers.output.json` | `programme` (the key), `lastYearActual`, `currentActual`, `budget`, `forecast`, `rag` (an enum: Red, Amber, Green), `implications`, and the `slide` it came from. |
| `dfe-student-numbers.input.json` | **api mode.** `request` the deck, then one `extract` with `kind: "table"`: `slide: "^Student Numbers$"` picks the slide by its title, `selector` the table by its header row, and a pattern per column. `forEach` emits one record per row. |
| `crawl.mjs`, `run.mjs`, `crawl.test.mjs` | Run it (shipped copy or live), print it, check it. |

## What the deck does, and how the recipe copes

```text
slide 6  ^Headcount  Headcount | Full year actuals (last year) | Actuals (current year) | Full-year budget | Full-year forecast | RAG | Financial Implications
```

- **A slide found by its title, not its number.** Decks get slides inserted and reordered; `slide:
  "^Student Numbers$"` survives that where `6` wouldn't. The record keeps the number it came from
  (`table.slide`).
- **Long headers, matched by their distinctive part.** `last year`, `current year`, `^Full-year budget`: a
  pattern only needs to tell one column from the others.
- **Numbers written for people.** `2,820` is text in a slide; `{ "op": "number", "locale": "en-GB" }` reads the
  thousands separator.
- **A closed set of values.** `rag` is an `enum`, so a cell saying anything but Red, Amber or Green fails the
  record instead of passing through.

Other tables in the deck are harder, and worth trying next: the KPI table on slide 2 mixes `£10.15m`,
`(£0.58m)` (a negative in brackets) and `-3 days` in one column, and some headers carry line-break artefacts
(`Move ment`, `full- year`). `opencraw probe management-accounts-model-march-2026.pptx` lists every table with a
ready selector.

## Source

Department for Education, *College management accounts good practice guide*, "Management accounts: PowerPoint
presentation model" (March 2026). Contains public sector information licensed under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
