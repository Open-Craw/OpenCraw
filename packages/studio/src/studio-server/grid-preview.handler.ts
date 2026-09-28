import { isWorkbookDocument } from '@opencraw/core'
import { cachedSnapshot } from '../page-snapshot'
import { previewGridTable } from '../document-view'
import type { GridPreviewCommand, GridTablePreviewView } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `grid-preview`: the grid canvas's live preview of a `table`
 * extract's options (`document-view`'s `table-preview.use-case.ts`'s
 * `previewGridTable`, studio plan §3.4, issue #94's 5c), off the same
 * cached snapshot `take-snapshot`/`grid-view` already captured — a pure
 * computation over it, so this answers instantly on every option change, no
 * re-fetch or re-parse.
 *
 * @param state - The server state.
 * @param command - The command; `command.path` must already have a cached snapshot (call `take-snapshot` first).
 * @returns The matched tables, or `error` when an option's pattern does not compile.
 * @throws Error when no workspace is open, or `command.path` has no cached snapshot yet.
 */
export function handleGridPreview (state: StudioState, command: GridPreviewCommand): GridTablePreviewView {
  const snapshot = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${command.recipeId}" at "${command.path}": call take-snapshot first`)
  if (!isWorkbookDocument(snapshot.body)) throw new Error(`"${command.recipeId}" at "${command.path}" is not a workbook snapshot: grid-preview only reads a read CSV/spreadsheet document`)

  return previewGridTable(snapshot.body, command.options)
}
