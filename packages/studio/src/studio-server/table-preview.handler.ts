import { isPdfDocument } from '@opencraw/core'
import { cachedSnapshot } from '../page-snapshot'
import { previewPdfTable } from '../document-view'
import type { TablePreviewCommand, TablePreviewView } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `table-preview`: the PDF canvas's live preview of a `table`
 * extract's options (`document-view`'s `table-preview.use-case.ts`, studio
 * plan §3.4, issue #94's 5b), off the same cached snapshot `take-snapshot`
 * already captured — a pure computation over it, so this answers instantly
 * on every option change, no re-fetch or re-parse.
 *
 * @param state - The server state.
 * @param command - The command; `command.path` must already have a cached snapshot (call `take-snapshot` first).
 * @returns The matches, or `error` when an option's pattern does not compile.
 * @throws Error when no workspace is open, or `command.path` has no cached snapshot yet.
 */
export function handleTablePreview (state: StudioState, command: TablePreviewCommand): TablePreviewView {
  const snapshot = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${command.recipeId}" at "${command.path}": call take-snapshot first`)
  if (!isPdfDocument(snapshot.body)) throw new Error(`"${command.recipeId}" at "${command.path}" is not a PDF snapshot: table-preview only reads a read PDF document`)

  return previewPdfTable(snapshot.body, command.options)
}
