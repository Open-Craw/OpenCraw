import type { PdfCellView, PdfPageView } from '@opencraw/studio'
import { anchorOf } from './pdf-prose.algorithm'
import type { Anchor } from './pdf-prose.algorithm'
import { cellBox, paddedBox } from './pdf-pick.mapper'
import type { PointsBox } from './pdf-pick.mapper'

/** One way to select the line that was clicked: what the recipe will be tied to, and the box that shows it. */
export interface SelectionChoice {
  /** What the step is tied to; `undefined` is a fixed position on the page. */
  anchor?: Anchor
  box:     PointsBox
}

/** A kind of value that has a recognisable shape, and the pattern that finds one (its first group is the value). */
interface Shape {
  name:    string
  pattern: string
}

const SHAPES: { name: string, test: RegExp, pattern: string }[] = [
  { name: 'date', test: /\b\d{1,2}\s+[A-Z]{3,9}\s+\d{4}\b/i, pattern: String.raw`(\d{1,2} [A-Za-z]{3,9} \d{4})` },
  { name: 'date', test: /\b\d{4}-\d{2}-\d{2}\b/, pattern: String.raw`(\d{4}-\d{2}-\d{2})` },
  { name: 'email address', test: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/, pattern: String.raw`([\w.+-]+@[\w-]+(?:\.[\w-]+)+)` },
  { name: 'amount', test: /[£$€]\s?\d[\d,.]*/, pattern: String.raw`([£$€]\s?\d[\d,.]*)` },
]

/**
 * The kind of value a line holds, when it holds one of a recognisable shape
 * (a date, an email address, an amount): the pattern then finds it wherever it
 * sits, so a recipe does not depend on which line it is on.
 *
 * @param text - One line of text.
 * @returns The shape, or `undefined` when the line holds none.
 */
export function shapeOf (text: string): Shape | undefined {
  const found = SHAPES.find(shape => shape.test.test(text))

  return found === undefined ? undefined : { name: found.name, pattern: found.pattern }
}

/**
 * The ways to select the line that was clicked, the first being what a click
 * does on its own: the whole block it belongs to, just that line (line N of
 * the block between its two headings), the date, address or amount in the
 * block, or a fixed position on the page (last, and brittle).
 *
 * @param pages - Every page of the document.
 * @param page - The page the cell is on.
 * @param cell - The line clicked.
 * @param blockBox - The box the click selects by default (its paragraph's, when it has no anchor).
 * @returns At least one choice.
 */
export function choicesOf (pages: readonly PdfPageView[], page: PdfPageView, cell: PdfCellView, blockBox: PointsBox): SelectionChoice[] {
  const anchor = anchorOf(pages, page, cell)
  const choices: SelectionChoice[] = [{ ...(anchor !== undefined && { anchor }), box: paddedBox(anchor?.kind === 'section' || (anchor?.kind === 'after' && anchor.lines > 1) ? anchor.box : blockBox) }]
  if (anchor?.kind === 'section') {
    const own = cellBox(cell)
    const shape = shapeOf(cell.text)
    if (anchor.clickedLine !== undefined) choices.push({ anchor: { ...anchor, line: anchor.clickedLine, box: own }, box: own })
    if (shape !== undefined) choices.push({ anchor: { ...anchor, match: shape.pattern, matchName: shape.name, box: own }, box: own })
  }
  if (anchor !== undefined) choices.push({ box: paddedBox(blockBox) })

  return choices
}
