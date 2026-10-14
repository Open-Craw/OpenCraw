import { isOn, walkXml } from '../ooxml-package'
import { cellValue } from './cell-value.algorithm'
import type { CellContext, NumberFormatKind, StoredCell } from './cell-value.algorithm'
import type { CellValue, ValueMode } from './workbook.model'

/** A worksheet part, read. */
export interface WorksheetContent {
  rows:                CellValue[][]
  hiddenRows:          number[]
  merges:              string[]
  /** Stored column widths in characters, by 0-based column (only columns the file sizes, up to the widest row). */
  columnWidths:        Record<number, number>
  /** Stored row heights in points, by 0-based row (only rows the file sizes). */
  rowHeights:          Record<number, number>
  /** The sheet's default column width in characters, when it declares one. */
  defaultColumnWidth?: number
  /** The sheet's default row height in points, when it declares one. */
  defaultRowHeight?:   number
}

interface ColumnSpan {
  min:   number
  max:   number
  width: number
}

interface OpenCell {
  row:    number
  column: number
  type:   string
  style:  number
  value:  string
}

/**
 * Reads a worksheet part as a stream: rows of cells (formulas give their
 * cached value, never evaluated), hidden rows and merged ranges. A row or a
 * cell without its reference (some generators leave `r` out) follows the one
 * before it.
 *
 * @param xml - The worksheet part.
 * @param context - Shared strings, number format kinds and the date system.
 * @param mode - `typed` or `text`.
 * @returns The content.
 */
export function readWorksheet (xml: string, context: CellContext & { formats: readonly NumberFormatKind[] }, mode: ValueMode): WorksheetContent {
  const rows: CellValue[][] = []
  const hiddenRows: number[] = []
  const merges: string[] = []
  const columnSpans: ColumnSpan[] = []
  const rowHeights: Record<number, number> = {}
  let defaultColumnWidth: number | undefined
  let defaultRowHeight: number | undefined
  let row = -1
  let column = -1
  let cell: OpenCell | undefined
  let capturing: 'value' | 'inline' | undefined
  let phonetic = 0
  const finish = (open: OpenCell): void => {
    const stored: StoredCell = { type: open.type, value: open.value, format: context.formats[open.style] ?? 'number' }
    rows[open.row] ??= []
    rows[open.row][open.column] = cellValue(stored, context, mode)
  }
  walkXml(xml, {
    open: (name, attributes) => {
      switch (name) {
        case 'row': {
          row = attributes.r === undefined ? row + 1 : Number(attributes.r) - 1
          column = -1
          rows[row] ??= []
          if (isOn(attributes.hidden)) hiddenRows.push(row)
          const height = positive(attributes.ht)
          if (height !== undefined) rowHeights[row] = height

          break
        }
        case 'c': {
          const reference = attributes.r === undefined ? undefined : cellOf(attributes.r)
          if (reference !== undefined) row = reference.row
          column = reference?.column ?? column + 1
          cell = { row, column, type: attributes.t ?? 'n', style: Number(attributes.s ?? 0), value: '' }

          break
        }
        case 'v': {
          if (cell !== undefined) capturing = 'value'

          break
        }
        case 'rPh': {
          phonetic += 1

          break
        }
        case 't': {
          if (phonetic === 0 && cell?.type === 'inlineStr') capturing = 'inline'

          break
        }
        case 'sheetFormatPr': {
          defaultRowHeight = positive(attributes.defaultRowHeight)
          defaultColumnWidth = positive(attributes.defaultColWidth)

          break
        }
        case 'col': {
          const width = positive(attributes.width)
          const min = Number(attributes.min)
          const max = Number(attributes.max)
          if (width !== undefined && min >= 1 && max >= min) columnSpans.push({ min: min - 1, max: max - 1, width })

          break
        }
        case 'mergeCell': {
          if (attributes.ref !== undefined) merges.push(attributes.ref)

          break
        }
        // No default
      }
    },
    text: (text) => {
      if (capturing !== undefined && cell !== undefined) cell.value += text
    },
    close: (name) => {
      if (name === 'v' || name === 't') {
        capturing = undefined
      } else if (name === 'rPh') {
        phonetic -= 1
      } else if (name === 'c' && cell !== undefined) {
        finish(cell)
        cell = undefined
      }
    },
  })
  const empty = mode === 'text' ? '' : null

  const cells = Array.from(rows, cells => Array.from(cells ?? [], value => value ?? empty))
  const columnWidths = widthsOf(columnSpans, Math.max(0, ...cells.map(cells => cells.length)))

  return {
    rows: cells,
    hiddenRows,
    merges,
    columnWidths,
    rowHeights,
    ...(defaultColumnWidth !== undefined && { defaultColumnWidth }),
    ...(defaultRowHeight !== undefined && { defaultRowHeight }),
  }
}

/** A stored size as a positive number, `undefined` when absent or not one. */
function positive (value: string | undefined): number | undefined {
  const parsed = Number(value)

  return value !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/** `<col min max width>` ranges as widths by column, never past the widest row (a range often runs to column 16384). */
function widthsOf (spans: readonly ColumnSpan[], columnCount: number): Record<number, number> {
  const widths: Record<number, number> = {}
  for (const span of spans) {
    for (let column = span.min; column <= Math.min(span.max, columnCount - 1); column += 1) widths[column] = span.width
  }

  return widths
}

/** `AB12` as 0-based row and column. */
function cellOf (reference: string): { row: number, column: number } | undefined {
  const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(reference)
  if (match === null) return undefined
  const letters = match[1].toUpperCase()
  let column = 0
  for (const letter of letters) column = column * 26 + (letter.codePointAt(0) ?? 64) - 64

  return { row: Number(match[2]) - 1, column: column - 1 }
}
