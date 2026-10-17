<p align="center">
  <img src="https://raw.githubusercontent.com/Open-Craw/OpenCraw/main/docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# @opencraw/ocr-tesseract

OCR for scanned PDFs, for [OpenCraw](https://github.com/Open-Craw/OpenCraw/blob/main/README.md). A scanned PDF is a picture of a page with no text in it;
this package reads the picture with Tesseract and gives the words back where they sit on the page, so a recipe's `table`, `region` and `section`
work on a scan as they do on a digital PDF.

```sh
npm install @opencraw/ocr-tesseract
```

Tesseract runs in WebAssembly in worker threads, and the English model comes with the package, so nothing is downloaded at run time. Another
language is one install away: `npm install @tesseract.js-data/por`.

## Use in a recipe

Install the package next to `@opencraw/core` and ask for OCR on the `request`:

```json
{ "type": "request", "id": "doc", "url": "{{start.url}}", "as": "pdf", "ocr": true }
{ "type": "request", "id": "doc", "url": "{{start.url}}", "as": "pdf", "ocr": { "languages": ["por", "eng"], "dpi": 200 } }
```

`ocr` is `true` (English, and only the pages that have no text layer) or an object:

| Option | Meaning |
|---|---|
| `languages` | Tesseract codes (`eng`, `por`, `ita`, `chi_sim`…). Each needs its `@tesseract.js-data/<code>` package, except `eng`. |
| `always` | Read every page by OCR and drop the text layer, for a PDF somebody ran bad OCR over. |
| `dpi` | The resolution a page is rendered at. Default: the scan's own, between 150 and 300. More only blurs a soft scan. |

Without the package, a request with `ocr` fails and says to install it. A scan read without `ocr` fails and says to ask for it.

## Use from code

```ts
import { createOcrEngine } from '@opencraw/ocr-tesseract'
import { pdfPageOcr, readPdf } from '@opencraw/core'

const engine = createOcrEngine()
const pdf = await readPdf(bytes, 'scan.pdf', { ocr: pdfPageOcr({ engine: () => Promise.resolve(engine), languages: ['eng'] }) })
await engine.dispose?.()
```

`createOcrEngine(options)` takes `languages` (used when a recipe names none), `langPath` (a folder of your own `<code>.traineddata.gz` models),
`segmentation` (Tesseract's page segmentation mode, default automatic) and `cleanup` (one way of cleaning a page, a list of ways tried in turn,
or `false` for the picture as it is). Anything that answers the `OcrEngine` contract of `@opencraw/core` can stand in for it: a cloud
service, another local engine.

## What it does to a page before reading it

Scans are rarely clean, and Tesseract reads clean pages. Each page is cleaned first, and every word comes back mapped to the original page's
coordinates, not the cleaned one's:

- **Background flattening** divides out yellowed paper, a dark spine and uneven lighting.
- **Deskew** measures the tilt from the rows of text and straightens the page (up to 5 degrees either way).
- **Adaptive binarisation and a median filter** turn a grainy, low-contrast scan into black ink on white.

No single cleaning is best for every scan, so the engine reads with a gentle one first, keeps it when the read is confident, and otherwise
tries a stronger one and keeps whichever read better.

OCR reads what is printed; it can still confuse a character (`8,0%` read as `8,09`). Check a number that matters against a second source.
