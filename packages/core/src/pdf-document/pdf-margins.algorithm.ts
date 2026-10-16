import type { PdfDocument, PdfRow } from './pdf-document.model'

/** The share of a page's height, at its top and at its bottom, where a repeated row is a running header or footer. */
const MARGIN_BAND = 0.15
/** Rows this close (points) vertically are on the same line of the page. */
const SAME_LINE = 3

/**
 * The running headers and footers of a PDF: rows in the top or bottom band of
 * a page whose text (digits aside, so `Page 2 of 5` repeats) shows at the same
 * height on more than one page.
 *
 * @param document - The read PDF.
 * @returns The rows; none for a single page, where nothing repeats.
 */
export function marginRows (document: PdfDocument): Set<PdfRow> {
  const seen = new Map<string, { pages: Set<number>, rows: PdfRow[] }>()
  for (const page of document.pages) {
    const inBand = page.rows.filter(candidate => inMarginBand(candidate, page.height))
    for (const row of inBand) {
      const key = marginKey(row)
      const entry = seen.get(key) ?? { pages: new Set<number>(), rows: [] }
      entry.pages.add(page.number)
      entry.rows.push(row)
      seen.set(key, entry)
    }
  }
  const margins = new Set<PdfRow>()
  for (const entry of seen.values()) {
    if (entry.pages.size > 1) for (const row of entry.rows) margins.add(row)
  }

  return margins
}

/**
 * The document without its running headers and footers, for a reader (a
 * table, a section) that must not take them for content.
 *
 * @param document - The read PDF.
 * @returns A copy with those rows left out; the same document when it has none.
 */
export function withoutMargins (document: PdfDocument): PdfDocument {
  const margins = marginRows(document)
  if (margins.size === 0) return document

  return { ...document, pages: document.pages.map(page => ({ ...page, rows: page.rows.filter(row => !margins.has(row)) })) }
}

function inMarginBand (row: PdfRow, pageHeight: number): boolean {
  return row.top >= pageHeight * (1 - MARGIN_BAND) || row.bottom <= pageHeight * MARGIN_BAND
}

/** A row's identity across pages: its text with digits blanked (page numbers), and the line it sits on. */
function marginKey (row: PdfRow): string {
  const text = row.cells.map(cell => cell.text).join(' ').toLowerCase().replaceAll(/\d+/g, '#').trim()

  return `${text}@${String(Math.round(row.bottom / SAME_LINE))}`
}
