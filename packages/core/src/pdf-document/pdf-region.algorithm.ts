import type { PdfCell, PdfDocument, PdfPage } from './pdf-document.model'

/** A rectangle on a page, in PDF points (y growing upwards), as a `region` extract's selector names it. */
export interface PdfRegion {
  /** A 1-based page number, or `'*'` for every page. */
  page: number | '*'
  x1:   number
  y1:   number
  x2:   number
  y2:   number
}

/** What a region reads off one page: the text, and the cells it was read from (what a studio canvas highlights). */
export interface PdfRegionMatch {
  page:  number
  text:  string
  cells: PdfCell[]
}

/** How much of a cell's own area must sit inside the region for the cell to count: a box drawn a little short still reads its line, a neighbour the box only grazes does not. */
const INSIDE_SHARE = 0.5

const REGION_PATTERN = /^\s*page=(\*|\d+)\s+x=(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)\s+y=(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)\s*$/

/**
 * Parses a `region` selector: `page=1 x=72..252 y=640..664` (points from
 * the page's bottom-left corner, as pdf.js reports them), or `page=*` to
 * read the same box off every page (a footer, a running header). The two
 * ends of each range may come in either order.
 *
 * @param selector - The selector.
 * @returns The region.
 * @throws Error when the selector does not have that shape.
 */
export function parseRegion (selector: string): PdfRegion {
  const match = REGION_PATTERN.exec(selector)
  if (match === null) throw new Error(`region: "${selector}" is not "page=<number|*> x=<from>..<to> y=<from>..<to>" (points, y up from the page's bottom edge)`)
  const [, page, xa, xb, ya, yb] = match
  const [x1, x2] = ordered(Number(xa), Number(xb))
  const [y1, y2] = ordered(Number(ya), Number(yb))

  return { page: page === '*' ? '*' : Number(page), x1, y1, x2, y2 }
}

/**
 * The selector for a region: the inverse of {@link parseRegion}, with whole
 * points (a PDF's text layer is not placed any finer than that in practice,
 * and the studio's canvas picks are rounded the same way).
 *
 * @param region - The region.
 * @returns `page=1 x=72..252 y=640..664`.
 */
export function regionSelector (region: PdfRegion): string {
  const [x1, x2] = ordered(region.x1, region.x2)
  const [y1, y2] = ordered(region.y1, region.y2)

  return `page=${String(region.page)} x=${String(Math.round(x1))}..${String(Math.round(x2))} y=${String(Math.round(y1))}..${String(Math.round(y2))}`
}

/**
 * Reads a region off a PDF: on each page it names, the cells at least half
 * inside the box, row by row — a row's cells joined by a space, rows by a
 * newline. A page where nothing sits in the box gives no match at all.
 *
 * @param document - The read PDF.
 * @param region - Where to read.
 * @returns One match per page with text in the box, in page order.
 */
export function regionText (document: PdfDocument, region: PdfRegion): PdfRegionMatch[] {
  const pages = region.page === '*' ? document.pages : document.pages.filter(page => page.number === region.page)

  return pages.flatMap((page) => {
    const rows = page.rows.map(row => row.cells.filter(cell => isInside(cell, region))).filter(cells => cells.length > 0)
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
export function regionCells (page: PdfPage, region: PdfRegion): PdfCell[] {
  return page.rows.flatMap(row => row.cells.filter(cell => isInside(cell, region)))
}

function isInside (cell: PdfCell, region: PdfRegion): boolean {
  const area = cell.width * cell.height
  if (area <= 0) return cell.x >= region.x1 && cell.x <= region.x2 && cell.y >= region.y1 && cell.y <= region.y2
  const overlapWidth = Math.min(cell.x + cell.width, region.x2) - Math.max(cell.x, region.x1)
  const overlapHeight = Math.min(cell.y + cell.height, region.y2) - Math.max(cell.y, region.y1)
  if (overlapWidth <= 0 || overlapHeight <= 0) return false

  return overlapWidth * overlapHeight >= INSIDE_SHARE * area
}

function ordered (a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a]
}
