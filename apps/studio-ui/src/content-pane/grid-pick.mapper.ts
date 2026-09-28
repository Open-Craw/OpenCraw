import type { GridSheetView, OutlineCard } from '@opencraw/studio'
import { escapedRowPattern } from './pdf-pick.mapper'

const DEFAULT_TABLE_ID = 'table'

/** A cell's own value — mirrors `@opencraw/core`'s `WorkbookCell`, which `@opencraw/studio`'s wire types do not re-export by name (a leaf slice/app declares its own structural type instead of reaching for one — `vertical-feature-slices.md`). */
export type GridCellValue = string | number | boolean

/**
 * The `table` extract card's options as the grid canvas builds them, one
 * pick at a time (studio plan §3.4, issue #94's 5c): a sheet tab's pick
 * gives `sheet`, the header row(s)' pick gives `header`/`headerRows`, the
 * first non-data row's pick gives `until`, a column's pick adds to
 * `columns`, a merged group's label pick adds to `fillDown`. Mirrors
 * `pdf-pick.mapper.ts`'s `TableDraft` and `document-view/table-preview.use-case.ts`'s
 * `GridTablePreviewOptions` — the live preview reads the very same shape.
 */
export interface GridDraft {
  sheet?:          string
  header?:         string
  /** The picked header block's first row index (0-based, within the sheet's own rows) — UI bookkeeping only, for extending the header pick to a following row and for computing a column's header text; never sent in the outline card. */
  headerRowIndex?: number
  headerRows?:     number
  until?:          string
  columns?:        Record<string, string>
  fillDown?:       string[]
  includeHidden?:  boolean
}

/**
 * An exact-match sheet-name pattern from a sheet tab's pick (issue #94's
 * 5c): anchored at both ends, so `sheet` matches this sheet and no other
 * whose name happens to start the same way.
 *
 * @param name - The sheet's own name.
 * @returns The pattern.
 */
export function sheetPattern (name: string): string {
  return `${escapedRowPattern(name)}$`
}

/**
 * The text a header/until row's pick reads off a grid row: its non-empty
 * cells' own text, trimmed, joined by spaces — mirrors `@opencraw/core`'s
 * own `plain(row)` in `grid-table.algorithm.ts`, exactly what
 * `GridTableQuery.header`/`until` are tested against (the row is read as
 * stored, merges not filled in — the same "raw row" core's own header match
 * reads).
 *
 * @param cells - The row's own cells, left to right.
 * @returns The joined text.
 */
export function rowPickText (cells: readonly { value: GridCellValue }[]): string {
  return cells.map(cell => String(cell.value).trim()).filter(text => text !== '').join(' ')
}

/**
 * The sheet's rows with every merged range's value copied into the cells it
 * covers — mirrors `@opencraw/core`'s own (unexported) `filledGrid` in
 * `grid-table.algorithm.ts`: a column's header text (below) needs it, the
 * same way core's own `columnsOf` reads the filled grid, not the raw rows,
 * so a header cell inside a horizontal merge (only its top-left cell holds
 * the text, as the file stores it) still contributes its text to every
 * column the merge covers.
 *
 * @param sheet - The sheet.
 * @returns The rows, filled (a fresh array; `sheet.rows` is not changed).
 */
export function filledGridOf (sheet: GridSheetView): GridCellValue[][] {
  const grid = sheet.rows.map(row => row.map(cell => cell.value))
  for (const merge of sheet.merges) {
    const value = grid[merge.top]?.[merge.left] ?? ''
    for (let row = merge.top; row <= merge.bottom; row += 1) {
      grid[row] ??= []
      for (let column = merge.left; column <= merge.right; column += 1) grid[row][column] = value
    }
  }

  return grid
}

/**
 * A column's header text at one column index, joined across the rows the
 * current header pick spans — the same distinct-texts join core's own
 * `columnsOf` builds a column's default key from (`grid-table.algorithm.ts`),
 * computed here off the filled grid so a group header merged across several
 * sub-columns (`Prezzo` over `Listino`/`Netto`) still names each of them.
 *
 * @param grid - The sheet's filled grid (`filledGridOf`).
 * @param headerRowIndexes - The header row(s)' own indices, top to bottom.
 * @param columnIndex - The column.
 * @returns The joined text; `''` when the column has no header text at all.
 */
export function columnHeaderText (grid: readonly (readonly GridCellValue[])[], headerRowIndexes: readonly number[], columnIndex: number): string {
  const parts: string[] = []
  for (const rowIndex of headerRowIndexes) {
    const text = String(grid[rowIndex]?.[columnIndex] ?? '').trim()
    if (text !== '' && !parts.includes(text)) parts.push(text)
  }

  return parts.join(' ')
}

/**
 * The output key a merged-group label pick resolves to (issue #94's 5c): the
 * key of an already-picked `columns` entry whose pattern was built from this
 * exact header text, or the raw header text itself when no column has been
 * named yet (the default, un-mapped output key `findGridTables` gives a
 * column with no `columns` entry).
 *
 * @param draft - The picks so far.
 * @param headerText - The merge's own column's header text (`columnHeaderText`).
 * @returns The key to add to `fillDown`.
 */
export function fillDownKeyFor (draft: GridDraft, headerText: string): string {
  const pattern = escapedRowPattern(headerText)
  const named = Object.entries(draft.columns ?? {}).find(([, value]) => value === pattern)

  return named?.[0] ?? headerText
}

/**
 * Builds (or updates) the `table` extract card from the picks so far (issue
 * #94's 5c). Mirrors `pdf-pick.mapper.ts`'s `tableCardNode`.
 *
 * @param draft - The picks so far; `header` must be set.
 * @param path - This node's outline path.
 * @param id - The step's own id; defaults to `"table"`.
 * @returns The outline card.
 * @throws Error when no header row has been picked yet.
 */
export function gridTableCardNode (draft: GridDraft, path: string, id: string = DEFAULT_TABLE_ID): OutlineCard {
  if (draft.header === undefined) throw new Error('gridTableCardNode: pick the header row first')
  const columns = draft.columns
  const hasColumns = columns !== undefined && Object.keys(columns).length > 0
  const hasFillDown = draft.fillDown !== undefined && draft.fillDown.length > 0

  return {
    kind:     'card',
    path,
    stepType: 'extract',
    sentence: [],
    custom:   false,
    step:     {
      type:     'extract',
      id,
      kind:     'table',
      selector: draft.header,
      ...(draft.sheet !== undefined && { sheet: draft.sheet }),
      ...(draft.until !== undefined && { until: draft.until }),
      ...(hasColumns && { columns }),
      ...(draft.headerRows !== undefined && draft.headerRows > 1 && { headerRows: draft.headerRows }),
      ...(hasFillDown && { fillDown: draft.fillDown }),
      ...(draft.includeHidden === true && { includeHidden: true }),
    },
  }
}

export { columnKeyFrom, escapedRowPattern } from './pdf-pick.mapper'
