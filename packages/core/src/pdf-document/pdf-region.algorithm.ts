import type { PdfCell, PdfDocument, PdfPage } from './pdf-document.model'

/**
 * A rectangle on a page of a PDF or a slide of a deck, as a `region` extract's
 * selector names it: `page=1 x=72..252 y=640..664` or `slide=3 x=60..900 y=30..90`.
 * Points, in the document's own coordinate space: a PDF's y grows upwards from
 * the page's bottom edge (as pdf.js reports it), a slide's downwards from its
 * top edge (as the presentation stores it).
 */
export interface DocumentRegion {
  /** What `at` counts: a PDF page, or a deck slide. */
  on: 'page' | 'slide'
  /** A 1-based page/slide number, or `'*'` for every one. */
  at: number | '*'
  x1: number
  y1: number
  x2: number
  y2: number
}

/** What a region reads off one PDF page: the text, and the cells it was read from (what a studio canvas highlights). */
export interface PdfRegionMatch {
  page:  number
  text:  string
  cells: PdfCell[]
}

/** A positioned box: a PDF cell or a deck shape, whichever way its y axis points. */
export interface PositionedBox {
  x:      number
  y:      number
  width:  number
  height: number
}

/** How much of a box's own area must sit inside the region for it to count: a box drawn a little short still reads its line, a neighbour the region only grazes does not. */
const INSIDE_SHARE = 0.5

const REGION_PATTERN = /^\s*(page|slide)=(\*|\d+)\s+x=(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)\s+y=(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)\s*$/

/**
 * Parses a `region` selector: `page=1 x=72..252 y=640..664` (a PDF page) or
 * `slide=3 x=60..900 y=30..90` (a deck slide), `*` for every page/slide (a
 * footer, a running header). The two ends of each range may come in either
 * order.
 *
 * @param selector - The selector.
 * @returns The region.
 * @throws Error when the selector does not have that shape.
 */
export function parseRegion (selector: string): DocumentRegion {
  const match = REGION_PATTERN.exec(selector)
  if (match === null) throw new Error(`region: "${selector}" is not "page=<number|*> x=<from>..<to> y=<from>..<to>" (a PDF, points up from the page's bottom edge) or "slide=<number|*> x=… y=…" (a deck, points down from the slide's top edge)`)
  const [, on, at, xa, xb, ya, yb] = match
  const [x1, x2] = ordered(Number(xa), Number(xb))
  const [y1, y2] = ordered(Number(ya), Number(yb))

  return { on: on as 'page' | 'slide', at: at === '*' ? '*' : Number(at), x1, y1, x2, y2 }
}

/**
 * The selector for a region: the inverse of {@link parseRegion}, with whole
 * points (a document's text is not placed any finer than that in practice,
 * and the studio's canvas picks are rounded the same way).
 *
 * @param region - The region.
 * @returns `page=1 x=72..252 y=640..664` / `slide=3 x=60..900 y=30..90`.
 */
export function regionSelector (region: DocumentRegion): string {
  const [x1, x2] = ordered(region.x1, region.x2)
  const [y1, y2] = ordered(region.y1, region.y2)

  return `${region.on}=${String(region.at)} x=${String(Math.round(x1))}..${String(Math.round(x2))} y=${String(Math.round(y1))}..${String(Math.round(y2))}`
}

/**
 * Reads a region off a PDF: on each page it names, the cells at least half
 * inside the box, row by row — a row's cells joined by a space, rows by a
 * newline. A page where nothing sits in the box gives no match at all.
 *
 * @param document - The read PDF.
 * @param region - Where to read (`at` counts pages).
 * @returns One match per page with text in the box, in page order.
 */
export function regionText (document: PdfDocument, region: DocumentRegion): PdfRegionMatch[] {
  const pages = region.at === '*' ? document.pages : document.pages.filter(page => page.number === region.at)

  return pages.flatMap((page) => {
    const rows = page.rows.map(row => row.cells.filter(cell => isInsideRegion(cell, region))).filter(cells => cells.length > 0)
    if (rows.length === 0) return []

    return [{ page: page.number, text: rows.map(cells => cells.map(cell => cell.text).join(' ')).join('\n'), cells: rows.flat() }]
  })
}

/**
 * The cells of one page a region reads: {@link regionText}'s choice, for a
 * canvas that highlights them while the box is still being drawn.
 *
 * @param page - The page.
 * @param region - The box.
 * @returns The cells at least half inside the box, in row order.
 */
export function regionCells (page: PdfPage, region: DocumentRegion): PdfCell[] {
  return page.rows.flatMap(row => row.cells.filter(cell => isInsideRegion(cell, region)))
}

/**
 * Whether a box counts as inside the region: at least half of its own area
 * is, or, for a box with no area, its corner is. Pure geometry, so it reads
 * the same whichever way the document's y axis points.
 *
 * @param box - A cell or a shape.
 * @param region - The region.
 */
export function isInsideRegion (box: PositionedBox, region: DocumentRegion): boolean {
  const area = box.width * box.height
  if (area <= 0) return box.x >= region.x1 && box.x <= region.x2 && box.y >= region.y1 && box.y <= region.y2
  const overlapWidth = Math.min(box.x + box.width, region.x2) - Math.max(box.x, region.x1)
  const overlapHeight = Math.min(box.y + box.height, region.y2) - Math.max(box.y, region.y1)
  if (overlapWidth <= 0 || overlapHeight <= 0) return false

  return overlapWidth * overlapHeight >= INSIDE_SHARE * area
}

function ordered (a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a]
}
