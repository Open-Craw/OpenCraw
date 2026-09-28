import type { PdfDocument } from '@opencraw/core'

/** One text cell, in PDF points (y growing upwards from the bottom edge) — mirrors `@opencraw/core`'s `PdfCell`. */
export interface PdfCellView {
  x:      number
  y:      number
  width:  number
  height: number
  text:   string
}

/** One row of cells, top to bottom. */
export interface PdfRowView {
  top:    number
  bottom: number
  cells:  PdfCellView[]
}

/** One page's geometry and diagnostics for the PDF canvas (studio plan §3.4, issue #94's 5b). */
export interface PdfPageView {
  number:       number
  /** In PDF points, the size `pdf.js` renders the page at scale 1. */
  width:        number
  height:       number
  rows:         PdfRowView[]
  /** `rows.length`, for the diagnostics line ("N rows, M cells"). */
  rowCount:     number
  cellCount:    number
  /** Whether `readPdf` found any text on this page — `false` means a scan: the person sees at once there is nothing here to read (issue #94's 5b). */
  hasTextLayer: boolean
}

/** The PDF canvas's view of a read document: every page's cells and rows, ready to draw over `pdf.js`'s own rendering. */
export interface PdfDocumentView {
  pages: PdfPageView[]
}

/**
 * Builds the PDF canvas's view model (studio plan §3.4, issue #94's 5b) from
 * an already-read `PdfDocument` (`take-snapshot`'s cached body — no second
 * read of the file): every cell and row `readPdf` found, in PDF points, plus
 * per-page counts and whether the page has a text layer at all. Table-specific
 * diagnostics (the header row, the column bands, the wrapped-row regrouping)
 * are not here — they depend on a `table` extract's own options, so they come
 * from `table-preview.use-case.ts` instead, computed live as those options
 * change.
 *
 * @param document - The read PDF.
 * @returns The view.
 */
export function pdfDocumentView (document: PdfDocument): PdfDocumentView {
  return {
    pages: document.pages.map(page => ({
      number: page.number,
      width:  page.width,
      height: page.height,
      rows:   page.rows.map(row => ({
        top:    row.top,
        bottom: row.bottom,
        cells:  row.cells.map(cell => ({ x: cell.x, y: cell.y, width: cell.width, height: cell.height, text: cell.text })),
      })),
      rowCount:     page.rows.length,
      cellCount:    page.rows.reduce((total, row) => total + row.cells.length, 0),
      hasTextLayer: page.rows.length > 0,
    })),
  }
}
