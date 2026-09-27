// Scenes for one page of the guide. Each runs the recipes in ../../recipes/<name>/ (or `recipes`), keeps
// `keep` records, and takes each of its `screenshots`: open `url`, run `steps` (fill, click, wait, select),
// outline each `highlight` selector with its label, save the viewport or the `clip` element. A screenshot
// with `pdf` instead renders that PDF's page with every cell readPdf found drawn on it.
//
// Page 7 reads documents from the repository as well as from the web. A recipe's `file:` URL must be
// absolute, so the `doc-` recipes start from the file's GitHub URL and the `repoFile` hook below turns it
// into a file URL into the checkout that runs the capture.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const ENPAM = 'https://www.enpam.it/wp-content/uploads/STELLANTIS-SCONTI-e-cod-promo_mese-09-2026.pdf'
const FIXTURE_PDF = 'packages/core/src/pdf-document/fixtures/discounts.pdf'
const FCC_DOCX = 'examples/fcc-regulatory-fees/fy2026-regulatory-fees-media-bureau.docx'

const BLOB = 'https://github.com/russoedu/open.craw/blob/main/'

/** `repoFile({ url })`: a file of this repository, named by its GitHub URL, as a `file:` URL into the checkout. */
const hooks = {
  repoFile: (_input, args) => {
    const url = String(args.url)
    if (!url.startsWith(BLOB)) throw new Error(`repoFile reads files of this repository, under ${BLOB}: not ${url}`)

    return pathToFileURL(join(REPO, decodeURIComponent(url.slice(BLOB.length)))).href
  },
}

/** Whether this run of capture.mjs captures the scene (not `--render`, not `--check`, not another `--only`). */
function capturing (name) {
  const { argv } = process
  if (argv.includes('--render') || argv.includes('--check')) return false

  return !argv.includes('--only') || argv[argv.indexOf('--only') + 1] === name
}

/** A document as a `data:` URL, so the figures of one scene fetch a live PDF once, not once per crop. */
async function dataUrl (url, type) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)

  return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
}

/** The HTML the engine builds from a Word document, read through a `file:` request as a recipe would. */
async function wordHtml (path) {
  const { HttpClient } = await import('@opencraw/core')
  const client = await HttpClient.open()
  try {
    const response = await client.send({ url: pathToFileURL(join(REPO, path)).href })
    // The engine's HTML has no styles: a few make the figure readable, the table's structure stays as built.
    const style = '<style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;max-width:1100px}td{border:1px solid #bbb;padding:3px 6px;vertical-align:top}table{border-collapse:collapse;margin:8px 0}</style>'

    return `data:text/html;charset=utf-8;base64,${Buffer.from(response.body.html.replace('<head>', `<head>${style}`)).toString('base64')}`
  } finally {
    await client.dispose()
  }
}

const enpam = capturing('pdf-discounts') || capturing('doc-pdf-enpam') ? await dataUrl(ENPAM, 'application/pdf') : ENPAM
const fixturePdf = `data:application/pdf;base64,${readFileSync(join(REPO, FIXTURE_PDF)).toString('base64')}`
const fccHtml = capturing('doc-docx-fcc') ? await wordHtml(FCC_DOCX) : 'about:blank'

const HEADERS = '^(MODELLI|MODELS)'

export const SCENES = [
  {
    name:        'pdf-discounts',
    keep:        4,
    screenshots: [{ pdf: enpam, page: 1, header: '^MODELLI' }],
  },
  {
    // Four of the ENPAM sheet's tables, the ones whose rows need regrouping; the crops of pages 1 and 2 go
    // with them. ENPAM's page 1 is 1008 x 1427 points, page 2 1214 x 1718.
    name:        'doc-pdf-enpam',
    keep:        40,
    screenshots: [
      { pdf: enpam, page: 1, header: HEADERS, region: [75, 56, 715, 82] },
      { pdf: enpam, page: 1, header: HEADERS, region: [75, 266, 715, 76] },
      { pdf: enpam, page: 1, header: HEADERS, region: [75, 494, 860, 238] },
      { pdf: enpam, page: 1, header: HEADERS, region: [75, 725, 860, 236] },
      { pdf: enpam, page: 1, header: HEADERS, region: [75, 1130, 715, 94] },
      { pdf: enpam, page: 2, header: HEADERS, region: [290, 960, 625, 146] },
    ],
  },
  {
    name:        'doc-pdf-fixture',
    keep:        14,
    crawler:     { hooks },
    screenshots: [{ pdf: fixturePdf, page: 1, header: HEADERS, region: [30, 38, 440, 222], scale: 3 }],
  },
  { name: 'doc-csv-listino', keep: 5, crawler: { hooks } },
  { name: 'doc-xlsx-incentivi', keep: 4, crawler: { hooks } },
  { name: 'doc-xlsx-gsa', keep: 3, crawler: { hooks } },
  { name: 'doc-pptx-dfe', keep: 3, crawler: { hooks } },
  { name: 'doc-pptx-incentivi', keep: 2, crawler: { hooks } },
  {
    name:        'doc-docx-fcc',
    keep:        3,
    crawler:     { hooks },
    screenshots: [{
      url:       fccHtml,
      clip:      'section table',
      maxHeight: 620,
      width:     1150,
      highlight: [
        { selector: 'section table', color: '#2e86ab' },
        { selector: 'section table td[colspan]', label: 'colspan="7": the merged range A1:G1', color: '#e4572e' },
      ],
    }],
  },
  { name: 'doc-markdown-listino', keep: 3, crawler: { hooks } },
]
