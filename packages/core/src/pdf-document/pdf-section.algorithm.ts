import type { PdfCell, PdfDocument, PdfRow } from './pdf-document.model'
import { marginRows } from './pdf-margins.algorithm'

/** A row whose text is at least this share of the heading's size is a heading too: it ends the section it follows. */
const HEADING_SIZE_SHARE = 0.95
/** A gap between two rows up to this share of the upper row's text height is leading inside a paragraph; more is a break. */
const SAME_PARAGRAPH_GAP = 0.6
/** A line that ends like this ends its sentence: the paragraph does not run on to the next page. */
const SENTENCE_END = /[!.:;?]["')\]]?$/

/** A line that opens a list item (`1.`, `2)`, `-`, a bullet) starts a paragraph of its own, whatever the spacing above it. */
const NEW_ITEM = /^(?:\d+[).]|[*•-])\s/
/** A line that ends on a letter and a hyphen is a word (or a compound) broken across lines: the next line joins it with no space. */
const WORD_BREAK = /\p{L}-$/u

/** What a `section` extract looks for. */
export interface PdfSectionQuery {
  /** Matches the heading row's text (its cells joined by a space). */
  heading:               RegExp
  /** Matches the row that ends the section; without it, the next row set in text as large as the heading does. */
  until?:                RegExp
  /** Leave out the running headers and footers (see {@link marginRows}): they are not part of a section that runs over a page break. */
  ignoreHeadersFooters?: boolean
}

/** One section a PDF holds: the text under a heading. */
export interface PdfSectionMatch {
  /** The page the heading is on. */
  page:    number
  /** The heading row's text. */
  heading: string
  /** The body: a paragraph's lines joined by a space, paragraphs by a newline. */
  text:    string
  /** The cells the body was read from, in reading order. */
  cells:   PdfCell[]
}

interface PlacedRow {
  page: number
  row:  PdfRow
}

/**
 * Finds the sections of a PDF: each row matching `heading` opens one, which
 * runs until the row `until` matches, or, without it, until the next row
 * whose text is as large as the heading's (the next heading of its level),
 * or the document's end, over page breaks. The body does not depend on where
 * the heading sits on the page, so the same recipe reads sheets of the same
 * layout whatever the length of their content.
 *
 * @param document - The read PDF.
 * @param query - The heading, where the section ends, and whether running headers and footers are left out.
 * @returns One match per heading that has a body, in reading order.
 */
export function findSections (document: PdfDocument, query: PdfSectionQuery): PdfSectionMatch[] {
  const margins = query.ignoreHeadersFooters === true ? marginRows(document) : new Set<PdfRow>()
  const rows = document.pages.flatMap(page => page.rows.filter(row => !margins.has(row)).map(row => ({ page: page.number, row })))
  const matches: PdfSectionMatch[] = []
  for (const [index, placed] of rows.entries()) {
    if (!query.heading.test(textOf(placed.row))) continue
    const body = bodyAfter(rows, index, query)
    if (body.length > 0) matches.push({ page: placed.page, heading: textOf(placed.row), text: paragraphsOf(readingOrder(body)), cells: body.flatMap(entry => entry.row.cells) })
  }

  return matches
}

/** The rows after `rows[index]` that belong to its section. */
function bodyAfter (rows: readonly PlacedRow[], index: number, query: PdfSectionQuery): PlacedRow[] {
  const size = sizeOf(rows[index]?.row)
  const following = rows.slice(index + 1)
  const end = following.findIndex(next => endsSection(next.row, size, query))

  return end === -1 ? following : following.slice(0, end)
}

function endsSection (row: PdfRow, headingSize: number, query: PdfSectionQuery): boolean {
  if (query.until === undefined) return sizeOf(row) >= headingSize * HEADING_SIZE_SHARE

  return query.until.test(textOf(row)) || query.heading.test(textOf(row))
}

/** One line of the body as it is read: a row's text, or, in a multi-column layout, one column's part of a row. */
interface Line {
  page:   number
  text:   string
  /** The baseline. */
  y:      number
  /** The top of the text. */
  top:    number
  height: number
}

/** Cells whose left edges are this close (points) start the same column. */
const SAME_COLUMN = 8

/**
 * The body's lines in reading order. A page whose rows hold side-by-side
 * columns of text (cells starting at the same few left edges, row after
 * row) is read one column at a time, left to right; every other page row
 * by row.
 */
function readingOrder (body: readonly PlacedRow[]): Line[] {
  const pages = [...new Set(body.map(entry => entry.page))]

  return pages.flatMap((page) => {
    const rows = body.filter(entry => entry.page === page).map(entry => entry.row)
    const starts = columnStarts(rows)
    if (starts.length < 2) return rows.map(row => ({ page, text: textOf(row), y: row.bottom, top: row.top, height: sizeOf(row) }))

    return starts.flatMap((_start, column) => columnLines(rows, starts, column, page))
  })
}

/** The lines of one column of a page, top to bottom. */
function columnLines (rows: readonly PdfRow[], starts: readonly number[], column: number, page: number): Line[] {
  const cells = rows.flatMap(row => row.cells).filter(cell => columnOf(starts, cell.x) === column)

  return cells.map(cell => ({ page, text: cell.text, y: cell.y, top: cell.y + cell.height, height: cell.height }))
}

/** The left edges that start a column: those several rows have a cell at, with at least two such. */
function columnStarts (rows: readonly PdfRow[]): number[] {
  const edges: { x: number, rows: number }[] = []
  const multiCell = rows.filter(candidate => candidate.cells.length > 1)
  for (const row of multiCell) {
    for (const cell of row.cells) {
      const edge = edges.find(candidate => Math.abs(candidate.x - cell.x) <= SAME_COLUMN)
      if (edge === undefined) edges.push({ x: cell.x, rows: 1 })
      else edge.rows += 1
    }
  }
  const starts = edges.filter(edge => edge.rows >= 2).map(edge => edge.x).sort((a, b) => a - b)

  return starts.length >= 2 ? starts : []
}

/** Which column a left edge falls in: the last start at or before it (a little before counts). */
function columnOf (starts: readonly number[], x: number): number {
  let column = 0
  for (const [index, start] of starts.entries()) {
    if (start <= x + SAME_COLUMN) column = index
  }

  return column
}

/** The text: lines at paragraph leading are one paragraph; one that runs off a page or a column without ending its sentence goes on at the top of the next. */
function paragraphsOf (lines: readonly Line[]): string {
  const paragraphs: string[] = []
  let previous: Line | undefined
  for (const line of lines) {
    if (previous !== undefined && continues(previous, line)) paragraphs[paragraphs.length - 1] = `${paragraphs.at(-1) ?? ''}${WORD_BREAK.test(previous.text) ? '' : ' '}${line.text}`
    else paragraphs.push(line.text)
    previous = line
  }

  return paragraphs.join('\n')
}

function continues (previous: Line, next: Line): boolean {
  if (NEW_ITEM.test(next.text)) return false
  const movesDown = previous.page === next.page && next.top <= previous.y + previous.height
  if (!movesDown) return !SENTENCE_END.test(previous.text)

  return previous.y - next.top <= previous.height * SAME_PARAGRAPH_GAP
}

function textOf (row: PdfRow): string {
  return row.cells.map(cell => cell.text).join(' ')
}

function sizeOf (row: PdfRow | undefined): number {
  return row === undefined ? 0 : Math.max(...row.cells.map(cell => cell.height))
}
