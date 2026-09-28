import { cachedSnapshot } from '../page-snapshot'
import { documentTreeView } from '../document-view'
import type { DocumentTreeCommand, DocumentTreeView } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `document-tree`: the content pane's tree canvas for a JSON, YAML
 * or XML document (`document-view`, studio plan §3.4, issue #94's 5a), off
 * the same cached snapshot `take-snapshot`/`inspect-page` already use.
 *
 * @param state - The server state.
 * @param command - The command; `command.path` must already have a cached snapshot (call `take-snapshot` first).
 * @returns The tree.
 * @throws Error when no workspace is open, `command.path` has no cached snapshot yet, or the snapshot's document is not JSON/YAML/XML (no parsed body at all in web mode; PDF/workbook/deck in api mode — see `documentTreeView`'s own doc comment).
 */
export function handleDocumentTree (state: StudioState, command: DocumentTreeCommand): DocumentTreeView {
  const snapshot = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${command.recipeId}" at "${command.path}": call take-snapshot first`)
  if (snapshot.body === undefined) throw new Error(`"${command.recipeId}" at "${command.path}" is a web-mode (HTML) snapshot: the tree canvas only reads a JSON/YAML/XML document`)

  return documentTreeView(snapshot.body)
}
