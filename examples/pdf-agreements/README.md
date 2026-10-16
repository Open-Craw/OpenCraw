# PDF agreements: one recipe, two layouts

Two service agreements with the same structure and nothing else in common:

| | [agreement.pdf](./agreement.pdf) | [agreement-two-columns.pdf](./agreement-two-columns.pdf) |
|---|---|---|
| Layout | one column | two columns |
| Headings | `DETAILS`, `PRICE`, `TERMS` | `Details`, `Price`, `Terms` |
| Header and footer | `SYSTEM EXTRACTION TEST SHEET — DOC A`, `Page 1 of 2` | `GLOBAL LOGISTICS CONTRACT — DOC B`, `Page 1 of 2` |
| Description | 2 paragraphs | 3 paragraphs, side by side |
| Price table | 3 tiers | 3 tiers, a footer right under it |

`agreement.ocw-in.json` reads both. It was built in the Studio by clicking on the first document and then
loading the second one, as [the tutorial](../../docs/studio/pdf-agreements.md) shows, step by step and with a
narrated video. The only edit after that was listing both documents as start points.

```sh
npm install
npm start          # records go to out/agreements.jsonl
npm run studio     # open the recipe and the documents in the Studio
```

## What each step anchors on

| Field | Step | Anchored on |
|---|---|---|
| `referenceId`, `effectiveDate`, `status` | `regex` | the label before the value (`Reference ID:`) |
| `details` | `section` | the text between the headings `DETAILS` and `PRICE`, whatever its length or columns |
| `terms` | `section` | everything below `TERMS`, over the page break |
| `tiers` | `table` | the header row `Service Tier`, until the row `TERMS` |

No step holds a position on the page: a `region` would read the wrong text as soon as a description is longer.

- `ignoreHeadersFooters` leaves out the header and footer a document repeats on its pages, so the footer does
  not land inside the table or the middle of a sentence.
- Selectors match case-insensitively, which is why `DETAILS` and `Details` are one heading.
- The Studio proposes `effectiveDate` as a `date` (`October 1, 2026` becomes `2026-10-01`) and the table as a
  `json` list of rows.
