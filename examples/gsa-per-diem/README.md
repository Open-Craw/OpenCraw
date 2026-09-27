<p align="center">
  <img src="https://raw.githubusercontent.com/russoedu/open.craw/main/docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# Every US federal per diem rate, from an Excel workbook

The U.S. General Services Administration publishes the per diem rates federal travellers are reimbursed at
(lodging, meals and incidentals) as one Excel workbook per fiscal year. This example reads the FY 2026 file: one
record per destination and season, 649 in all.

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
AL | Birmingham                   | all year     | lodging $126 | meals $80
AL | Gulf Shores                  | October 1    | lodging $134 | meals $74
...
649 records written to …/examples/gsa-per-diem/out/per-diem-rates.jsonl (the shipped copy)
  gsa-per-diem: 649 emitted, 1 rejected, 171 ms
```

```json
{"state":"AL","destination":"Gulf Shores","counties":"Baldwin","seasonBegin":"March 1","seasonEnd":"May 31","lodgingUsd":163,"mealsUsd":74}
```

## What's in it

| File | What it does |
|---|---|
| `gsa-per-diem-fy2026.xlsx` | The workbook, as GSA published it (42 KB). |
| `per-diem-rate.output.json` | `state`, `destination`, `counties`, `seasonBegin`, `seasonEnd`, `lodgingUsd`, `mealsUsd`. Key: state + destination + seasonBegin, since a destination has one row per season. |
| `gsa-per-diem.input.json` | **api mode.** `request` the workbook, then one `extract` with `kind: "table"`: the `Master` sheet, the table whose header row starts with `ID STATE DESTINATION`, and a pattern per column. `forEach` over the rows emits one record each. |
| `crawl.mjs`, `run.mjs`, `crawl.test.mjs` | Run it (shipped copy or live), print it, check it. |

## What the workbook does, and how the recipe copes

```text
Master r1  FY2026 Per Diem Rates - Effective October 1, 2025
Master r2  ID | STATE | DESTINATION | COUNTY/LOCATION DEFINED | SEASON BEGIN | SEASON END | FY26 Lodging Rate | FY26 M&IE
Master r3  Standard CONUS rate applies to all counties not specifically listed. ... | 110 | 68
Master r5  2 | AL | Gulf Shores | Baldwin | October 1 | February 28 | 134 | 74
```

- **A title row above the header.** The `selector` finds the header by its text (`^ID STATE DESTINATION`), not
  by its position, so row 1 is skipped whatever it says.
- **Columns found by name, including the year.** `FY26 Lodging Rate` is matched by `Lodging Rate$`, so the
  recipe also reads next year's file, whose header will say `FY27`.
- **A row that isn't a destination.** Row 3 is the standard rate for everywhere not listed ($110 and $68), with
  no state. The `state` rule says `onMissing: "skip-record"`, so that row is rejected and counted (the trace
  shows `✖ record rejected: state: missing`), and every record has a state.
- **Rows without a season.** Year-round rates leave both season cells empty: `seasonBegin` gets
  `{ "op": "default", "value": "all year" }`, which also keeps the key unique; `seasonEnd` stays `null`.
- **Numbers are numbers.** The rate cells are numeric in the workbook, so they arrive as numbers and need no
  transform.

`opencraw probe gsa-per-diem-fy2026.xlsx` lists the sheet and its rows. It doesn't suggest this header
([#73](https://github.com/russoedu/open.craw/issues/73): it skips header rows containing a digit, and this one
has `FY26`), so the selector was written from row 2 by hand.

## Source

[FY 2026 Per Diem Rates, master file](https://www.gsa.gov/travel/plan-a-trip/per-diem-rates/per-diem-files),
U.S. General Services Administration. A work of the US federal government, in the public domain. The URL has one
fixed name per fiscal year, and earlier years' files stay online for at least two years.
