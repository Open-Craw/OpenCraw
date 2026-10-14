import type { GridSheetView } from '@opencraw/studio'

/** Pixels per character of the default font's widest digit: how a spreadsheet's column width in characters becomes pixels. */
const PIXELS_PER_CHARACTER = 7
/** A point as pixels at 96 dpi. */
const PIXELS_PER_POINT = 4 / 3
/** A row of a sheet that declares no heights (a CSV, or a file without them). */
const FALLBACK_ROW_HEIGHT = 24
/** A column of a sheet that declares no widths: Excel's default of 8.43 characters. */
const FALLBACK_COLUMN_WIDTH = 64
const MIN_SIZE = 4

/** Where every column and row of a sheet sits, in pixels, from the sizes the file stores. */
export interface SheetGeometry {
  /** The left edge of each column, plus a last entry for the total width. */
  columnLefts: number[]
  /** The top edge of each row, plus a last entry for the total height. */
  rowTops:     number[]
  /** The sum of every column's width. */
  width:       number
  /** The sum of every row's height. */
  height:      number
}

/**
 * Column and row positions for a sheet, using the widths and heights stored
 * in the file (characters and points, as a spreadsheet keeps them) so the
 * grid looks like the sheet does in Excel; sizes the file does not give
 * fall back to the sheet's declared default, then to a fixed one.
 *
 * @param sheet - The sheet as the grid view answers it.
 * @param columnCount - How many columns to lay out.
 * @param rowCount - How many rows to lay out.
 * @returns The positions.
 */
export function sheetGeometry (sheet: Pick<GridSheetView, 'columnWidths' | 'rowHeights' | 'defaultColumnWidth' | 'defaultRowHeight'>, columnCount: number, rowCount: number): SheetGeometry {
  const defaultWidth = sheet.defaultColumnWidth === undefined ? FALLBACK_COLUMN_WIDTH : widthInPixels(sheet.defaultColumnWidth)
  const defaultHeight = sheet.defaultRowHeight === undefined ? FALLBACK_ROW_HEIGHT : heightInPixels(sheet.defaultRowHeight)
  const columnLefts = [0]
  for (let column = 0; column < columnCount; column += 1) {
    const stored = sheet.columnWidths?.[String(column)]
    columnLefts.push(columnLefts[column] + (stored === undefined ? defaultWidth : widthInPixels(stored)))
  }
  const rowTops = [0]
  for (let row = 0; row < rowCount; row += 1) {
    const stored = sheet.rowHeights?.[String(row)]
    rowTops.push(rowTops[row] + (stored === undefined ? defaultHeight : heightInPixels(stored)))
  }

  return { columnLefts, rowTops, width: columnLefts[columnCount], height: rowTops[rowCount] }
}

/**
 * A column's name as a spreadsheet shows it: `A`…`Z`, `AA`…
 *
 * @param index - 0-based column.
 * @returns The letters.
 */
export function columnName (index: number): string {
  let name = ''
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) name = String.fromCodePoint(65 + ((rest - 1) % 26)) + name

  return name
}

function widthInPixels (characters: number): number {
  return Math.max(MIN_SIZE, Math.round(characters * PIXELS_PER_CHARACTER))
}

function heightInPixels (points: number): number {
  return Math.max(MIN_SIZE, Math.round(points * PIXELS_PER_POINT))
}
