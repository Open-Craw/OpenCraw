import type { Sheet, WorkbookCell, WorkbookDocument } from '@opencraw/core'

/** A cell's type, for the grid to show it as (issue #94's 5c): a number and a boolean keep their runtime type; a date is a string that reads as one of the ISO shapes `read-xlsx.client.ts` writes (a day, a moment, or both) — the workbook model itself has no separate date type (`WorkbookCell` is `string | number | boolean`), so this is the same "does it look like one" a person reading the cell would make. */
export type GridCellType = 'string' | 'number' | 'boolean' | 'date'

/** One cell, with the type the grid shows it as. */
export interface GridCellView {
  value: WorkbookCell
  type:  GridCellType
}

/** One merged range, 0-based and inclusive — mirrors `@opencraw/core`'s A1 references (`Sheet.merges`), already resolved to bounds so the grid can draw it as one cell (`rowSpan`/`colSpan`) instead of parsing `B10:B13` itself. */
export interface GridMergeView {
  ref:    string
  top:    number
  left:   number
  bottom: number
  right:  number
}

/** One sheet of the grid canvas (issue #94's 5c). */
export interface GridSheetView {
  name:        string
  hidden:      boolean
  /** 0-based row indices hidden in the sheet. */
  hiddenRows:  number[]
  /** The widest row's own length, ragged rows included — for the grid to size its columns. */
  columnCount: number
  rows:        GridCellView[][]
  merges:      GridMergeView[]
}

/** What `grid-view` answers with (studio plan §3.4, issue #94's 5c): every sheet's cells, typed, with hidden sheets/rows marked and merged ranges resolved — the CSV/workbook grid's own view of the document, structurally the same idea as `pdf-view.mapper.ts`'s `PdfDocumentView`. */
export interface WorkbookDocumentView {
  sheets: GridSheetView[]
  /** Present when the workbook came from a CSV — the detected (or overridden) delimiter and encoding, shown and overridable (issue #94's 5c). */
  csv?:   { encoding: string, delimiter: string }
}

/** A cell reads as an ISO date (`2026-06-01`), an ISO moment (`2026-06-01T09:30:00`) or a bare time of day (`09:30:00`) — the three shapes `workbook-document`'s `read-xlsx.client.ts` writes for a spreadsheet date. */
const ISO_DATE_OR_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?$|^\d{2}:\d{2}:\d{2}$/

/**
 * Builds the grid canvas's view model (studio plan §3.4, issue #94's 5c) from
 * an already-read `WorkbookDocument` (`take-snapshot`'s cached body — no
 * second read of the file): every sheet's cells, typed, with hidden sheets
 * and rows marked, and merged ranges resolved to bounds so the grid draws
 * them as one cell. Table-specific diagnostics (the matched rows of the
 * current `table` extract's options) are not here — they depend on the
 * picks so far, so they come from `table-preview.use-case.ts`'s
 * `previewGridTable` instead, computed live as those options change.
 *
 * @param document - The read workbook (a spreadsheet or a CSV).
 * @returns The view.
 */
export function workbookDocumentView (document: WorkbookDocument): WorkbookDocumentView {
  return {
    sheets: document.sheets.map(sheet => sheetView(sheet)),
    ...(document.csv !== undefined && { csv: document.csv }),
  }
}

function sheetView (sheet: Sheet): GridSheetView {
  return {
    name:        sheet.name,
    hidden:      sheet.hidden === true,
    hiddenRows:  sheet.hiddenRows === undefined ? [] : [...sheet.hiddenRows],
    columnCount: Math.max(0, ...sheet.rows.map(row => row.length)),
    rows:        sheet.rows.map(row => row.map(cell => cellView(cell))),
    merges:      (sheet.merges ?? []).flatMap(reference => {
      const range = rangeOf(reference)

      return range === undefined ? [] : [{ ref: reference, ...range }]
    }),
  }
}

function cellView (cell: WorkbookCell): GridCellView {
  return { value: cell, type: cellType(cell) }
}

function cellType (cell: WorkbookCell): GridCellType {
  if (typeof cell === 'number') return 'number'
  if (typeof cell === 'boolean') return 'boolean'

  return ISO_DATE_OR_TIME.test(cell) ? 'date' : 'string'
}

/** `B10:B13` (or a single cell, `A1`) as 0-based inclusive bounds; `undefined` for anything else — mirrors `@opencraw/core`'s own (unexported) `rangeOf`/`cellOf` in `grid-table.algorithm.ts`: a small pure parse, kept here rather than reached for across the package boundary (a sibling slice's non-`index.ts` file is never imported, and this is `@opencraw/core`'s own private helper, not even on its barrel). */
function rangeOf (reference: string): { top: number, left: number, bottom: number, right: number } | undefined {
  const [from, to = from] = reference.split(':', 2)
  const start = cellOf(from)
  const end = cellOf(to)
  if (start === undefined || end === undefined) return undefined

  return { top: Math.min(start.row, end.row), left: Math.min(start.column, end.column), bottom: Math.max(start.row, end.row), right: Math.max(start.column, end.column) }
}

function cellOf (reference: string): { row: number, column: number } | undefined {
  const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(reference.trim())
  if (match === null) return undefined
  const letters = match[1].toUpperCase()
  let column = 0
  for (const char of letters) column = column * 26 + (char.codePointAt(0) ?? 64) - 64

  return { row: Number(match[2]) - 1, column: column - 1 }
}
