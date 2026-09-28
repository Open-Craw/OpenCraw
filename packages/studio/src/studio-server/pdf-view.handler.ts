import { isPdfDocument } from '@opencraw/core'
import { cachedSnapshot } from '../page-snapshot'
import { pdfDocumentView } from '../document-view'
import type { PdfDocumentView, PdfViewCommand } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `pdf-view`: the PDF canvas's cells and rows (`document-view`'s
 * `pdf-view.mapper.ts`, studio plan §3.4, issue #94's 5b), off the same
 * cached snapshot `take-snapshot`/`document-tree` already use.
 *
 * @param state - The server state.
 * @param command - The command; `command.path` must already have a cached snapshot (call `take-snapshot` first).
 * @returns The document's view.
 * @throws Error when no workspace is open, `command.path` has no cached snapshot yet, or the snapshot's document is not a read PDF.
 */
export function handlePdfView (state: StudioState, command: PdfViewCommand): PdfDocumentView {
  const snapshot = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${command.recipeId}" at "${command.path}": call take-snapshot first`)
  if (!isPdfDocument(snapshot.body)) throw new Error(`"${command.recipeId}" at "${command.path}" is not a PDF snapshot: the PDF canvas only reads a read PDF document`)

  return pdfDocumentView(snapshot.body)
}
