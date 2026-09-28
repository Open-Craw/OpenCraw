import { isDeckDocument } from '@opencraw/core'
import { cachedSnapshot } from '../page-snapshot'
import { previewDeckTable } from '../document-view'
import type { DeckPreviewCommand, DeckTablePreviewView } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `deck-preview`: the deck canvas's live preview of a `table`
 * extract's options (`document-view`'s `table-preview.use-case.ts`'s
 * `previewDeckTable`, studio plan §3.4, issue #94's 5d), off the same cached
 * snapshot `take-snapshot`/`deck-view` already captured — a pure computation
 * over it, so this answers instantly on every option change, no re-fetch or
 * re-parse.
 *
 * @param state - The server state.
 * @param command - The command; `command.path` must already have a cached snapshot (call `take-snapshot` first).
 * @returns The matched tables, or `error` when an option's pattern does not compile.
 * @throws Error when no workspace is open, or `command.path` has no cached snapshot yet.
 */
export function handleDeckPreview (state: StudioState, command: DeckPreviewCommand): DeckTablePreviewView {
  const snapshot = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${command.recipeId}" at "${command.path}": call take-snapshot first`)
  if (!isDeckDocument(snapshot.body)) throw new Error(`"${command.recipeId}" at "${command.path}" is not a deck snapshot: deck-preview only reads a read PowerPoint document`)

  return previewDeckTable(snapshot.body, command.options)
}
