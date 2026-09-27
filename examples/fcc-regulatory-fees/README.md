<p align="center">
  <img src="https://raw.githubusercontent.com/russoedu/open.craw/main/docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# A fee table in a Word document: US radio station regulatory fees

The Federal Communications Commission publishes each year's regulatory fees as fact sheets, in Word and PDF.
This example reads the FY 2026 Media Bureau sheet's radio table: one record per population band, with the fee
and payment type code for each of six station classes.

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
<=10,000               | AM A $560 (2659) | FM B $700 (2664)
10,001 – 25,000        | AM A $935 (2617) | FM B $1170 (2647)
...
9 records written to …/examples/fcc-regulatory-fees/out/radio-station-fees.jsonl (the shipped copy)
  fcc-radio-fees: 9 emitted, 0 rejected, 177 ms
```

```json
{"populationServed":">6,000,000","amClassA":{"paymentTypeCode":"2693","feeUsd":15980},"amClassB":{"paymentTypeCode":"2694","feeUsd":11535},"amClassC":{"paymentTypeCode":"2695","feeUsd":10000},"amClassD":{"paymentTypeCode":"2696","feeUsd":11025},"fmClassesA":{"paymentTypeCode":"2697","feeUsd":17515},"fmClassesB":{"paymentTypeCode":"2698","feeUsd":19995}}
```

## What's in it

| File | What it does |
|---|---|
| `fy2026-regulatory-fees-media-bureau.docx` | The fact sheet, as the FCC published it on 9 September 2026 (55 KB). |
| `radio-station-fee.output.json` | `populationServed` (the key), then one `object` per station class, each with `paymentTypeCode` and `feeUsd`. |
| `fcc-radio-fees.input.json` | **api mode.** `request` the document: a Word file becomes the current page, as HTML. Then one `extract` with `kind: "table"` reads the table whose header starts with `Population Served`, a pattern per class column. `forEach` emits one record per population band. |
| `crawl.mjs`, `run.mjs`, `crawl.test.mjs` | Run it (shipped copy or live), print it, check it. |

## What the document does, and how the recipe copes

```text
[merged across the table] FY 2026 RADIO STATION REGULATORY FEES, PAYMENT TYPE CODE & FEE
Population Served | AM Class A | AM Class B | AM Class C | AM Class D | FM Classes A, B1 & C3 | FM Classes B, C, C0, C1 & C2
<=10,000          | 2659 / $560 | 2660 / $405 | ...
```

- **A Word document is read as a page.** `@opencraw/office-reader` turns it into HTML (headings, lists, tables
  with their merged cells), so the `request` has no `id` and the `extract` has no `from`: it reads the current
  page, the way it would read a web page's table.
- **A title row merged across the table.** The `selector` finds the table by its header row's text, so the
  merged title above it is skipped.
- **Two values in one cell.** Each cell holds the payment type code, then the fee, on two lines. Two mapping
  rules read the same cell: `regex` `^\s*(\d{4})` for the code, `regex` `\$\s*([\d,.]+)` then `number` for the fee.
  The line break between them is lost when the table is read ([#72](https://github.com/russoedu/open.craw/issues/72)),
  so the cell arrives as `2659$560`; the patterns accept both forms, so the recipe keeps working once that's fixed.
- **Dotted targets build objects.** `amClassA.paymentTypeCode` and `amClassA.feeUsd` fill the `amClassA` object
  the output declares.
- **Column headers with digits and odd spacing.** `FM Classes A, B1 & C3` also loses its line break (it reads
  `FM ClassesA, B1 & C3`), hence the pattern `^FM Classes\s*A`. `probe` doesn't suggest this header
  ([#73](https://github.com/russoedu/open.craw/issues/73)); the selector was written by hand from what it lists.

The same document has three simpler tables (`Regulatory Fee Group or Category | Regulatory Fee | Payment Type
Code`, and two like it), a good next recipe to write.

## Source

[FY 2026 Regulatory Fees – Media Bureau](https://docs.fcc.gov/public/attachments/DOC-424493A1.docx),
Federal Communications Commission. A work of the US federal government, in the public domain.
