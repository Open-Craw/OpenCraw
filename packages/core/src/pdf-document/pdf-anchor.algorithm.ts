import type { PdfCell, PdfDocument, PdfPage } from './pdf-document.model'

/**
 * Where an `anchor` extract reads, relative to a label: the cell(s) to its
 * `right` on the same line, or the line(s) `below` it in its column. The
 * selector is `[page=<n|*>] <right|below> [count=<n>] of <pattern>`, e.g.
 * `right of ^Valid until` or `page=1 below count=2 of ^Bill to`. The label
 * is found by its text, so the same recipe reads another document of the
 * same kind whose values sit at other coordinates.
 */
export interface PdfAnchor {
  /** A 1-based page number, or `'*'` for every page. */
  page:      number | '*'
  direction: 'right' | 'below'
  /** How many cells (to the right) or lines (below) to read. */
  count:     number
  /** The label: the first cell, in reading order, whose text matches, on each page. */
  pattern:   RegExp
}

/** What an anchor reads off one PDF page: the text, the label cell it was found from, and the cells read (what a studio canvas highlights). */
export interface PdfAnchorMatch {
  page:  number
  text:  string
  label: PdfCell
  cells: PdfCell[]
}

/** Points of slack when deciding a cell lies past a label's edge or under its baseline: text boxes are rounded and drawn a hair off. */
const TOLERANCE = 1

const ANCHOR_PATTERN = /^\s*(?:page=(\*|\d+)\s+)?(right|below)(?:\s+count=(\d+))?\s+of\s+(\S.*)$/

/**
 * Parses an `anchor` selector: `right of ^Valid until`, `below of …`,
 * `page=2 right count=2 of ^Total`. The pattern is case-insensitive, like
 * every pattern the engine reads PDFs with.
 *
 * @param selector - The selector.
 * @returns The anchor.
 * @throws Error when the selector does not have that shape, the count is not at least 1, or the pattern is not a regular expression.
 */
export function parseAnchor (selector: string): PdfAnchor {
  const match = ANCHOR_PATTERN.exec(selector)
  if (match === null) throw new Error(`anchor: "${selector}" is not "[page=<number|*>] <right|below> [count=<n>] of <pattern>" (for example "right of ^Valid until")`)
  const [, page, direction, countText, rawSource] = match
  const source = rawSource.trim()
  const count = countText === undefined ? 1 : Number(countText)
  if (count < 1) throw new Error(`anchor: count must be at least 1, got ${String(count)}`)
  let pattern: RegExp
  try {
    pattern = new RegExp(source, 'i')
  } catch (error) {
    throw new Error(`anchor: the pattern "${source}" is not a regular expression: ${(error as Error).message}`, { cause: error })
  }

  return { page: page === undefined || page === '*' ? '*' : Number(page), direction: direction as 'right' | 'below', count, pattern }
}

/**
 * Reads what an anchor points at on a PDF: on each page in scope, from the
 * first cell whose text matches the label (reading order: top to bottom, left
 * to right). `right` takes the next `count` cells on the label's line,
 * joined by a space. `below` takes the next `count` lines in the label's
 * column (cells whose horizontal extent overlaps the label's), a line's cells
 * joined by a space, lines by a newline. A page with no label, or with
 * nothing there, gives no match.
 *
 * @param document - The read PDF.
 * @param anchor - What to read.
 * @returns One match per page where the anchor found something, in page order.
 */
export function anchorText (document: PdfDocument, anchor: PdfAnchor): PdfAnchorMatch[] {
  const pages = anchor.page === '*' ? document.pages : document.pages.filter(page => page.number === anchor.page)

  return pages.flatMap((page) => {
    const found = findLabel(page, anchor.pattern)
    if (found === undefined) return []
    const lines = anchor.direction === 'right' ? [rightOf(found.row, found.cell, anchor.count)] : below(page, found.cell, anchor.count)
    const cells = lines.flat()
    if (cells.length === 0) return []

    return [{ page: page.number, text: lines.filter(line => line.length > 0).map(line => line.map(cell => cell.text).join(' ')).join('\n'), label: found.cell, cells }]
  })
}

function findLabel (page: PdfPage, pattern: RegExp): { row: PdfCell[], cell: PdfCell } | undefined {
  for (const row of page.rows) {
    const cell = row.cells.find(candidate => pattern.test(candidate.text))
    if (cell !== undefined) return { row: row.cells, cell }
  }

  return undefined
}

/** The cells after the label on its line, nearest first: one line of up to `count` cells. */
function rightOf (row: readonly PdfCell[], label: PdfCell, count: number): PdfCell[] {
  return row.filter(cell => cell !== label && cell.x >= label.x + label.width - TOLERANCE).sort((a, b) => a.x - b.x).slice(0, count)
}

/** Up to `count` lines under the label, nearest first, each the cells of that line in the label's column. */
function below (page: PdfPage, label: PdfCell, count: number): PdfCell[][] {
  const lines: PdfCell[][] = []
  for (const row of page.rows) {
    const cells = row.cells.filter(cell => cell !== label && cell.y + cell.height <= label.y + TOLERANCE && overlapsHorizontally(cell, label))
    if (cells.length > 0) lines.push(cells)
  }

  return lines.sort((a, b) => Math.max(...b.map(cell => cell.y)) - Math.max(...a.map(cell => cell.y))).slice(0, count)
}

function overlapsHorizontally (a: PdfCell, b: PdfCell): boolean {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > TOLERANCE
}
