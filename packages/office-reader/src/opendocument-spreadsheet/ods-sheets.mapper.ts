import { walkXml } from '../ooxml-package'
import type { CellValue, Sheet, SheetFilter, ValueMode } from '../spreadsheet'
import { odsCellValue } from './ods-cell.algorithm'

/** The most rows and columns a sheet is ever expanded to: the format's own limits. A file that repeats an empty row a million times costs nothing. */
const MAX_ROWS = 1_048_576
const MAX_COLUMNS = 16_384

interface SheetBuilder {
  name:             string
  style:            string
  rows:             CellValue[][]
  hiddenRows:       number[]
  merges:           string[]
  /** Empty rows seen since the last row with a cell: kept only if a row with a cell follows. */
  pendingEmptyRows: number
}

interface RowBuilder {
  repeat:       number
  hidden:       boolean
  cells:        CellValue[]
  /** Empty cells seen since the last cell with a value: kept only if one follows. */
  pendingEmpty: number
}

interface CellBuilder {
  attributes: Record<string, string>
  paragraphs: string[]
  repeat:     number
  colSpan:    number
  rowSpan:    number
}

function count (value: string | undefined): number {
  const number = Math.trunc(Number(value ?? ''))

  return Number.isNaN(number) || number < 1 ? 1 : number
}

/** A column index as its letters: 0 → `A`, 26 → `AA`. */
function letters (index: number): string {
  let rest = index + 1
  let name = ''
  while (rest > 0) {
    const digit = (rest - 1) % 26
    name = String.fromCodePoint(65 + digit) + name
    rest = Math.floor((rest - 1) / 26)
  }

  return name
}

function selector (filter: SheetFilter | undefined): (sheet: { name: string, hidden: boolean }) => boolean {
  if (filter === undefined) return () => true
  if (typeof filter === 'string') return sheet => sheet.name === filter
  if (filter instanceof RegExp) return sheet => filter.test(sheet.name)

  return filter
}

/**
 * Reads the sheets of an OpenDocument spreadsheet's `content.xml`: each table's cells (empty trailing rows and cells, which the format
 * repeats up to its limits, are dropped), the merged ranges as A1 references and the hidden rows and sheets a person would not see.
 *
 * @param xml - The text of `content.xml`.
 * @param mode - `typed` or `text` values.
 * @param filter - Which sheets to keep, by name or test; default all.
 * @returns The sheets in document order.
 */
export function odsSheets (xml: string, mode: ValueMode, filter?: SheetFilter): Sheet<CellValue>[] {
  const keep = selector(filter)
  const hiddenTableStyles = new Set<string>()
  const sheets: Sheet<CellValue>[] = []
  let styleName = ''
  let styleFamily = ''
  let inSpreadsheet = false
  let tableDepth = 0
  let sheet: SheetBuilder | undefined
  let row: RowBuilder | undefined
  let cell: CellBuilder | undefined
  let inParagraph = false

  const emptyOf = (): CellValue => (mode === 'text' ? '' : null)
  const isEmpty = (value: CellValue): boolean => value === null || value === ''

  function finishCell (done: CellBuilder, current: RowBuilder, builder: SheetBuilder): void {
    const value = odsCellValue({ attributes: done.attributes, paragraphs: done.paragraphs }, mode)
    const column = current.cells.length + current.pendingEmpty
    if (done.colSpan > 1 || done.rowSpan > 1) {
      const row0 = builder.rows.length + builder.pendingEmptyRows
      builder.merges.push(`${letters(column)}${String(row0 + 1)}:${letters(column + done.colSpan - 1)}${String(row0 + done.rowSpan)}`)
    }
    if (isEmpty(value)) {
      current.pendingEmpty += done.repeat

      return
    }
    for (let index = 0; index < current.pendingEmpty && current.cells.length < MAX_COLUMNS; index += 1) current.cells.push(emptyOf())
    current.pendingEmpty = 0
    for (let index = 0; index < done.repeat && current.cells.length < MAX_COLUMNS; index += 1) current.cells.push(value)
  }

  function finishRow (done: RowBuilder, builder: SheetBuilder): void {
    if (done.cells.length === 0) {
      builder.pendingEmptyRows += done.repeat
      // A hidden run of empty rows is a few hundred at most in practice; a huge one is the format filling the sheet.
      if (done.hidden && done.repeat <= 1000) for (let index = 0; index < done.repeat; index += 1) builder.hiddenRows.push(builder.rows.length + builder.pendingEmptyRows - done.repeat + index)

      return
    }
    for (let index = 0; index < builder.pendingEmptyRows && builder.rows.length < MAX_ROWS; index += 1) builder.rows.push([])
    builder.pendingEmptyRows = 0
    for (let index = 0; index < done.repeat && builder.rows.length < MAX_ROWS; index += 1) {
      if (done.hidden) builder.hiddenRows.push(builder.rows.length)
      builder.rows.push([...done.cells])
    }
  }

  walkXml(xml, {
    open: (name, attributes) => {
      switch (name) {
        case 'spreadsheet': {
          inSpreadsheet = true
          break
        }
        case 'style': {
          styleName = attributes['style:name'] ?? ''
          styleFamily = attributes['style:family'] ?? ''
          break
        }
        case 'table-properties': {
          if (styleFamily === 'table' && attributes['table:display'] === 'false') hiddenTableStyles.add(styleName)
          break
        }
        case 'table': {
          if (!inSpreadsheet) break
          tableDepth += 1
          if (tableDepth === 1) sheet = { name: attributes['table:name'] ?? '', style: attributes['table:style-name'] ?? '', rows: [], hiddenRows: [], merges: [], pendingEmptyRows: 0 }
          break
        }
        case 'table-row': {
          if (tableDepth === 1) row = { repeat: count(attributes['table:number-rows-repeated']), hidden: attributes['table:visibility'] === 'collapse' || attributes['table:visibility'] === 'filter', cells: [], pendingEmpty: 0 }
          break
        }
        case 'table-cell':
        case 'covered-table-cell': {
          if (tableDepth === 1 && row !== undefined) cell = { attributes, paragraphs: [], repeat: count(attributes['table:number-columns-repeated']), colSpan: count(attributes['table:number-columns-spanned']), rowSpan: count(attributes['table:number-rows-spanned']) }
          break
        }
        case 'p': {
          if (cell !== undefined && tableDepth === 1) {
            inParagraph = true
            cell.paragraphs.push('')
          }
          break
        }
        case 's': {
          if (cell !== undefined && inParagraph && tableDepth === 1) cell.paragraphs[cell.paragraphs.length - 1] += ' '.repeat(count(attributes['text:c']))
          break
        }
        case 'tab': {
          if (cell !== undefined && inParagraph && tableDepth === 1) cell.paragraphs[cell.paragraphs.length - 1] += '\t'
          break
        }
        case 'line-break': {
          if (cell !== undefined && inParagraph && tableDepth === 1) cell.paragraphs[cell.paragraphs.length - 1] += '\n'
          break
        }
        // No default
      }
    },
    text: (text) => {
      if (cell !== undefined && inParagraph && tableDepth === 1) cell.paragraphs[cell.paragraphs.length - 1] += text
    },
    close: (name) => {
      switch (name) {
        case 'p': {
          inParagraph = false
          break
        }
        case 'table-cell':
        case 'covered-table-cell': {
          if (tableDepth !== 1) break
          if (cell !== undefined && row !== undefined && sheet !== undefined) finishCell(cell, row, sheet)
          cell = undefined
          break
        }
        case 'table-row': {
          if (tableDepth !== 1) break
          if (row !== undefined && sheet !== undefined) finishRow(row, sheet)
          row = undefined
          break
        }
        case 'table': {
          if (!inSpreadsheet) break
          if (tableDepth === 1 && sheet !== undefined) {
            const hidden = hiddenTableStyles.has(sheet.style)
            if (keep({ name: sheet.name, hidden })) sheets.push({ name: sheet.name, hidden, rows: sheet.rows, hiddenRows: sheet.hiddenRows, merges: sheet.merges })
            sheet = undefined
          }
          tableDepth -= 1
          break
        }
        // No default
      }
    },
  })

  return sheets
}
