import type { PdfCellView, PdfPageView, PdfRowView } from '@opencraw/studio'
import type { PointsBox } from './pdf-pick.mapper'

/** Left edges closer than this (points) belong to one block of text. */
const SAME_LEFT_EDGE = 2
/** Text heights within this ratio of each other are the same style: a heading is not part of the paragraph under it. */
const SAME_HEIGHT_RATIO = 0.15
/** A gap between two lines up to this share of the line height is leading inside a paragraph; more is a break between paragraphs. */
const SAME_PARAGRAPH_GAP = 0.6
/** Lines whose centres are this close (points) are centred on one axis: a title broken over two lines. */
const SAME_CENTRE = 3
/** The longest label taken as one (`Published`, `Head of Sustainability`): a longer run before a colon is a sentence. */
const MAX_LABEL_LENGTH = 40

/** A heading is text this much larger than the body it heads. */
const HEADING_LARGER = 1.15
/** A row at least this share of a heading's size is a heading of the same level: it ends the section. */
const SAME_LEVEL = 0.95

/** What a click on a line is anchored to, so that the recipe reads the same structure in another document. */
export type Anchor =
  | {
    kind:                 'section'
    /** The heading's text. */
    heading:              string
    /** The next heading's text; absent when the section runs to the end. */
    until?:               string
    /** The body, for the preview. */
    box:                  PointsBox
    /** The document repeats a header or footer on its pages, so the section leaves them out. */
    ignoreHeadersFooters: boolean
  } |
  {
    kind:     'after'
    /** The text of the row above the line. */
    previous: string
    /** How many lines the selection is: a title broken over two touching lines is one text. */
    lines:    number
    box:      PointsBox
    page:     number
  }

/** A line shaped `Label: value`. */
export interface LabelledValue {
  label: string
  value: string
}

/**
 * The box of the paragraph a line belongs to: the line and the lines
 * above and below it that start at the same left edge, are the same size
 * and sit at paragraph leading. A line in a table row (more than one cell)
 * or alone on its row is its own paragraph.
 *
 * @param page - The page the cell is on.
 * @param cell - The line clicked.
 * @returns The box, in points; the cell's own box when it has no neighbours.
 */
export function paragraphBox (page: PdfPageView, cell: PdfCellView): PointsBox {
  const own = boxOf(cell)
  const at = page.rows.findIndex(row => row.cells.includes(cell))
  if (at === -1 || page.rows[at]?.cells.length !== 1) return own

  let box = own
  let last = cell
  for (let index = at + 1; index < page.rows.length; index += 1) {
    const next = lineOf(page, index)
    if (next === undefined || !continues(last, next)) break
    box = union(box, boxOf(next))
    last = next
  }
  last = cell
  for (let index = at - 1; index >= 0; index -= 1) {
    const previous = lineOf(page, index)
    if (previous === undefined || !continues(previous, last)) break
    box = union(box, boxOf(previous))
    last = previous
  }

  return box
}

/**
 * Splits `Label: value`. Times (`10:30`) and addresses (`https://…`) are not
 * labelled values, nor is a sentence that happens to hold a colon.
 *
 * @param text - One line of text.
 * @returns The label and value, or `undefined` when the line is not shaped that way.
 */
export function labelledValueOf (text: string): LabelledValue | undefined {
  const match = /^([A-Z][\w &()./-]*):\s*(\S.*)$/i.exec(text.trim())
  if (match === null) return undefined
  const [, rawLabel = '', value = ''] = match
  const label = rawLabel.trim()
  if (label.length > MAX_LABEL_LENGTH || value.startsWith('//')) return undefined

  return { label, value: value.trim() }
}

/**
 * A step id from a label: lowerCamelCase words (`Head of Sustainability` →
 * `headOfSustainability`), `value` when it has no usable word.
 *
 * @param label - The label text.
 */
export function idFromLabel (label: string): string {
  const words = label.toLowerCase().split(/[^\da-z]+/).filter(word => word !== '')
  const [first, ...rest] = words
  if (first === undefined) return 'value'
  const id = first + rest.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')

  return /^\d/.test(id) ? `value${id.charAt(0).toUpperCase()}${id.slice(1)}` : id
}

/** The single cell on a row, or `undefined` for an empty row or a row with several (a table's). */
function lineOf (page: PdfPageView, index: number): PdfCellView | undefined {
  const cells = page.rows[index]?.cells

  return cells?.length === 1 ? cells[0] : undefined
}

/** Whether `lower` is the line after `upper` in one paragraph. */
function continues (upper: PdfCellView, lower: PdfCellView): boolean {
  const gap = upper.y - (lower.y + lower.height)
  const sameHeight = Math.abs(upper.height - lower.height) <= Math.max(upper.height, lower.height) * SAME_HEIGHT_RATIO

  const sameEdge = Math.abs(upper.x - lower.x) <= SAME_LEFT_EDGE
  const sameCentre = Math.abs(upper.x + upper.width / 2 - (lower.x + lower.width / 2)) <= SAME_CENTRE

  return (sameEdge || sameCentre) && sameHeight && gap <= upper.height * SAME_PARAGRAPH_GAP
}

function boxOf (cell: PdfCellView): PointsBox {
  return { x1: cell.x, y1: cell.y, x2: cell.x + Math.max(cell.width, 1), y2: cell.y + cell.height }
}

function union (a: PointsBox, b: PointsBox): PointsBox {
  return { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) }
}

/** A row of the document with the page it is on. */
interface PlacedRow {
  page: number
  row:  PdfRowView
}

/**
 * What the line is anchored to in the document's own structure: the section
 * it belongs to (the text between its heading and the next heading of the
 * same level, over page breaks), else the line that comes right before it.
 * Headers and footers the document repeats on its pages are not part of either.
 *
 * A heading is a row of larger text above the line that has a sibling: another
 * row of the same size in the document (`Details` and `Price`). A document's
 * title has none, so does not make everything under it one section.
 *
 * A line in a row of several cells is a column of text when the cells are not
 * all `Label: value` pairs (a row of those is a set of fields, each its own).
 *
 * @param pages - Every page of the document, in order.
 * @param page - The page the cell is on.
 * @param cell - The line clicked.
 * @returns The anchor, or `undefined` when the line is alone in the document's structure (then a position is all there is).
 */
export function anchorOf (pages: readonly PdfPageView[], page: PdfPageView, cell: PdfCellView): Anchor | undefined {
  const rows = pages.flatMap(each => each.rows.filter(row => row.running !== true).map(row => ({ page: each.number, row })))
  const at = rows.findIndex(entry => entry.row.cells.includes(cell))
  const own = rows[at]?.row
  if (own === undefined || isFieldRow(own)) return undefined
  const heading = headingAbove(rows, at, cell.height)
  if (heading !== -1) return sectionAnchor(rows, heading, page.number, pages.some(each => each.rows.some(row => row.running === true)))

  return afterAnchor(page, rows, at)
}

/** A row of two or more `Label: value` cells: a set of fields. */
function isFieldRow (row: PdfRowView): boolean {
  return row.cells.length > 1 && row.cells.every(cell => labelledValueOf(cell.text) !== undefined)
}

/** The index of the nearest heading above row `at`, or -1. */
function headingAbove (rows: readonly PlacedRow[], at: number, size: number): number {
  for (let index = at - 1; index >= 0; index -= 1) {
    const cells = rows[index]?.row.cells ?? []
    const first = cells[0]
    const larger = first !== undefined && first.height > size * HEADING_LARGER
    if (larger && cells.length === 1 && hasSibling(rows, index)) return index
  }

  return -1
}

function hasSibling (rows: readonly PlacedRow[], index: number): boolean {
  const height = rows[index]?.row.cells[0]?.height ?? 0

  return rows.some((entry, other) => other !== index && entry.row.cells.length === 1 && Math.abs((entry.row.cells[0]?.height ?? 0) - height) <= height * (1 - SAME_LEVEL))
}

function sectionAnchor (rows: readonly PlacedRow[], heading: number, clickedPage: number, ignoreHeadersFooters: boolean): Anchor | undefined {
  const headingRow = rows[heading]?.row
  const size = headingRow?.cells[0]?.height ?? 0
  const headingText = headingRow?.cells[0]?.text
  if (headingText === undefined) return undefined
  const rest = rows.slice(heading + 1)
  const end = rest.findIndex(entry => Math.max(...entry.row.cells.map(cell => cell.height)) >= size * SAME_LEVEL)
  const body = end === -1 ? rest : rest.slice(0, end)
  const cells = body.filter(entry => entry.page === clickedPage).flatMap(entry => entry.row.cells)
  const boxes = cells.map(cell => boxOf(cell))
  const [first, ...others] = boxes
  if (first === undefined) return undefined
  const until = end === -1 ? undefined : rest[end]?.row.cells.map(cell => cell.text).join(' ')

  return { kind: 'section', heading: headingText, ...(until !== undefined && { until }), box: others.reduce((all, box) => union(all, box), first), ignoreHeadersFooters }
}

/** The single line `cell` is, taken with the row above it as its anchor; a wrapped paragraph of several lines has none. */
function afterAnchor (page: PdfPageView, placed: readonly PlacedRow[], at: number): Anchor | undefined {
  const rows = placed.filter(entry => entry.page === page.number).map(entry => entry.row)
  const index = rows.indexOf(placed[at]?.row)
  if (rows[index]?.cells.length !== 1) return undefined
  let first = index
  while (first > 0 && continuesRow(rows[first - 1], rows[first])) first -= 1
  let last = index
  while (last < rows.length - 1 && continuesRow(rows[last], rows[last + 1])) last += 1
  const above = rows[first - 1]
  const lines = rows.slice(first, last + 1).map(row => row.cells[0]).filter(line => line !== undefined)
  const [top, ...rest] = lines
  if (above === undefined || top === undefined) return undefined
  // Lines of body text that run on are a paragraph (no anchor); stacked lines of a headline are one text.
  if (lines.length > 1 && top.height <= bodyHeight(rows) * HEADING_LARGER) return undefined

  return { kind: 'after', previous: above.cells.map(row => row.text).join('\t'), lines: lines.length, box: rest.reduce((all, line) => union(all, boxOf(line)), boxOf(top)), page: page.number }
}

/** Whether the single line of `lower` runs on from the single line of `upper`. */
function continuesRow (upper: PdfRowView | undefined, lower: PdfRowView | undefined): boolean {
  const upperCell = upper?.cells.length === 1 ? upper.cells[0] : undefined
  const lowerCell = lower?.cells.length === 1 ? lower.cells[0] : undefined

  // A line that ends with a colon is a label: what follows it is its value, not more of it.
  return upperCell !== undefined && lowerCell !== undefined && !upperCell.text.trimEnd().endsWith(':') && continues(upperCell, lowerCell)
}

/** The usual text height on the page: the median of its rows', so that headline lines stacked tight are not taken for a wrapped paragraph. */
function bodyHeight (rows: readonly PdfRowView[]): number {
  const heights = rows.map(row => Math.max(...row.cells.map(cell => cell.height))).sort((a, b) => a - b)

  return heights[Math.floor(heights.length / 2)] ?? 0
}
