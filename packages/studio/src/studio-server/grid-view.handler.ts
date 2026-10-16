import { isWorkbookDocument } from '@opencraw/core'
import { cachedSnapshot, putSnapshot, rereadCsv } from '../page-snapshot'
import { workbookDocumentView, workbookSheetRows } from '../document-view'
import type { GridRowsCommand, GridRowsView, GridViewCommand, WorkbookDocumentView } from '../studio-api'
import type { StudioState } from './workspace.store'

/** How many rows of a sheet the first `grid-view` answer carries; a bigger sheet's other rows come from `grid-rows` as the grid is scrolled. */
export const GRID_WINDOW_ROWS = 200

/**
 * Handles `grid-view`: the grid canvas's sheets and cells (`document-view`'s
 * `workbook-view.mapper.ts`, studio plan §3.4, issue #94's 5c), off the same
 * cached snapshot `take-snapshot`/`document-tree`/`pdf-view` already use.
 *
 * `delimiter`/`encoding` re-read a CSV with the override applied
 * (`page-snapshot`'s `rereadCsv`) and replace the cached snapshot's body with
 * the fresh reading, so a following `grid-preview` (and another `grid-view`
 * with no override) sees the same one — the override sticks until
 * `take-snapshot` recaptures.
 *
 * @param state - The server state.
 * @param command - The command; `command.path` must already have a cached snapshot (call `take-snapshot` first).
 * @returns The document's view.
 * @throws Error when no workspace is open, `command.path` has no cached snapshot yet, an override is given for a snapshot that is not a CSV, or the snapshot's document is not a read workbook.
 */
export async function handleGridView (state: StudioState, command: GridViewCommand): Promise<WorkbookDocumentView> {
  const snapshot = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${command.recipeId}" at "${command.path}": call take-snapshot first`)
  const overriding = command.delimiter !== undefined || command.encoding !== undefined
  if (!overriding) {
    if (!isWorkbookDocument(snapshot.body)) throw new Error(`"${command.recipeId}" at "${command.path}" is not a workbook snapshot: the grid canvas only reads a read CSV/spreadsheet document`)

    return workbookDocumentView(snapshot.body, { windowRows: GRID_WINDOW_ROWS })
  }
  if (snapshot.format !== 'csv') throw new Error(`"${command.recipeId}" at "${command.path}" is not a CSV snapshot: "delimiter"/"encoding" only override a CSV reading`)
  const body = await rereadCsv(snapshot.baseUrl, { delimiter: command.delimiter, encoding: command.encoding })
  putSnapshot(state.snapshots, command.recipeId, command.path, { ...snapshot, body })

  return workbookDocumentView(body, { windowRows: GRID_WINDOW_ROWS })
}

/**
 * Handles `grid-rows`: a run of one sheet's rows from the cached snapshot, for the grid that holds only a few screens of a big file at a time.
 *
 * @param state - The server state.
 * @param command - The command; `command.path` must already have a cached snapshot.
 * @returns The rows (none past the end of the sheet).
 * @throws Error when there is no cached snapshot or it is not a workbook.
 */
export function handleGridRows (state: StudioState, command: GridRowsCommand): GridRowsView {
  const snapshot = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${command.recipeId}" at "${command.path}": call take-snapshot first`)
  if (!isWorkbookDocument(snapshot.body)) throw new Error(`"${command.recipeId}" at "${command.path}" is not a workbook snapshot: grid-rows only reads a CSV/spreadsheet document`)

  return { rows: workbookSheetRows(snapshot.body, command.sheet, command.from, command.count) }
}
