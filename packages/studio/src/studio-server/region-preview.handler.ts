import { isDeckDocument, isPdfDocument } from '@opencraw/core'
import { previewRegion } from '../document-view'
import { cachedSnapshot } from '../page-snapshot'
import type { RegionPreviewCommand, RegionPreviewView } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `region-preview`: the PDF and deck canvases' live preview of a
 * `region` extract's selector (`document-view`'s
 * `region-preview.use-case.ts`, issues #121 and #122), off the same cached
 * snapshot `take-snapshot` already captured — a pure computation over it,
 * so this answers instantly on every change of the box, no re-fetch or
 * re-parse (mirrors `table-preview.handler.ts`).
 *
 * @param state - The server state.
 * @param command - The command; `command.path` must already have a cached snapshot (call `take-snapshot` first).
 * @returns The matches, or `error` when the selector does not parse or does not fit the document.
 * @throws Error when `command.path` has no cached snapshot yet, or the snapshot is neither a PDF nor a deck.
 */
export function handleRegionPreview (state: StudioState, command: RegionPreviewCommand): RegionPreviewView {
  const snapshot = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${command.recipeId}" at "${command.path}": call take-snapshot first`)
  if (!isPdfDocument(snapshot.body) && !isDeckDocument(snapshot.body)) throw new Error(`"${command.recipeId}" at "${command.path}" is neither a PDF nor a deck snapshot: region-preview only reads a read PDF or PowerPoint document`)

  return previewRegion(snapshot.body, command.selector)
}
