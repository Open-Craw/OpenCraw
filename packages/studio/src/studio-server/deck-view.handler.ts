import { isDeckDocument } from '@opencraw/core'
import { cachedSnapshot } from '../page-snapshot'
import { deckDocumentView } from '../document-view'
import type { DeckDocumentView, DeckViewCommand } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `deck-view`: the deck canvas's slides, shapes, tables, charts and
 * notes (`document-view`'s `deck-view.mapper.ts`, studio plan §3.4, issue
 * #94's 5d), off the same cached snapshot `take-snapshot`/`document-tree`
 * already use.
 *
 * @param state - The server state.
 * @param command - The command; `command.path` must already have a cached snapshot (call `take-snapshot` first).
 * @returns The document's view.
 * @throws Error when no workspace is open, `command.path` has no cached snapshot yet, or the snapshot's document is not a read deck.
 */
export function handleDeckView (state: StudioState, command: DeckViewCommand): DeckDocumentView {
  const snapshot = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${command.recipeId}" at "${command.path}": call take-snapshot first`)
  if (!isDeckDocument(snapshot.body)) throw new Error(`"${command.recipeId}" at "${command.path}" is not a deck snapshot: the deck canvas only reads a read PowerPoint document`)

  return deckDocumentView(snapshot.body)
}
