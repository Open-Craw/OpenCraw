import { cachedSnapshot } from '../page-snapshot'
import { domTree, pageData } from '../page-inspector'
import type { InspectPageCommand, InspectView } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `inspect-page`: the Inspect panel's DOM tree and data-in-the-page
 * findings, off the same cached snapshot `take-snapshot`/`infer-selector`
 * already use (`page-inspector`, issue #93). `domTree` reads the cached,
 * rewritten snapshot (the same markup the content pane's iframe shows, so a
 * tree row's `nodeId` lines up with it exactly); `pageData` reads the raw
 * capture (`SnapshotResult.rawHtml`), since the display snapshot has had its
 * `<script>` tags stripped for the sandboxed iframe.
 *
 * @param state - The server state.
 * @param command - The command; `command.path` must already have a cached snapshot (call `take-snapshot` first).
 * @returns The tree and the data-in-the-page findings.
 * @throws Error when no workspace is open, or `command.path` has no cached snapshot yet.
 */
export function handleInspectPage (state: StudioState, command: InspectPageCommand): InspectView {
  const snapshot = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${command.recipeId}" at "${command.path}": call take-snapshot first`)

  return { tree: domTree(snapshot.html), pageData: pageData(snapshot.rawHtml) }
}
