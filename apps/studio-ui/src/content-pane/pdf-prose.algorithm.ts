import type { PdfCellView, PdfPageView } from '@opencraw/studio'
import type { PointsBox } from './pdf-pick.mapper'

/** Left edges closer than this (points) belong to one block of text. */
const SAME_LEFT_EDGE = 2
/** Text heights within this ratio of each other are the same style: a heading is not part of the paragraph under it. */
const SAME_HEIGHT_RATIO = 0.15
/** A gap between two lines up to this share of the line height is leading inside a paragraph; more is a break between paragraphs. */
const SAME_PARAGRAPH_GAP = 0.6
/** The longest label taken as one (`Published`, `Head of Sustainability`): a longer run before a colon is a sentence. */
const MAX_LABEL_LENGTH = 40

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

  return Math.abs(upper.x - lower.x) <= SAME_LEFT_EDGE && sameHeight && gap <= upper.height * SAME_PARAGRAPH_GAP
}

function boxOf (cell: PdfCellView): PointsBox {
  return { x1: cell.x, y1: cell.y, x2: cell.x + Math.max(cell.width, 1), y2: cell.y + cell.height }
}

function union (a: PointsBox, b: PointsBox): PointsBox {
  return { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) }
}
