import { cachedSnapshot, putSnapshot, takeSnapshot } from '../page-snapshot'
import { loadRecipePair } from '../sample-run'
import type { SnapshotView, TakeSnapshotCommand } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `take-snapshot`: loads the named input recipe, captures its
 * snapshot at `command.path` (only `"start"` is captured for now — see
 * `page-snapshot`'s `take-snapshot.use-case.ts`), and caches it so a later
 * `verify-selector`/`infer-selector` against the same recipe and path, or
 * the UI reselecting the same step, does not recapture it.
 *
 * @param state - The server state: `folder` must already be set.
 * @param command - The command.
 * @returns The rewritten snapshot.
 * @throws Error when no workspace is open, or the recipe cannot be found or loaded.
 */
export async function handleTakeSnapshot (state: StudioState, command: TakeSnapshotCommand): Promise<SnapshotView> {
  if (state.folder === undefined) throw new Error('open a workspace first')
  const cached = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (cached !== undefined) return snapshotView(cached)
  const { input } = await loadRecipePair(state.folder, command.recipeId)
  const snapshot = await takeSnapshot(input, command.path, state.browser)
  putSnapshot(state.snapshots, command.recipeId, command.path, snapshot)

  return snapshotView(snapshot)
}

/** The wire view of a cached snapshot: `html`/`nodeCount`/`baseUrl`/`format`, never `rawHtml` or the parsed `body` (server-side only — see `SnapshotResult`'s own doc comments). */
function snapshotView (snapshot: { html: string, nodeCount: number, baseUrl: string, format?: SnapshotView['format'] }): SnapshotView {
  return { html: snapshot.html, nodeCount: snapshot.nodeCount, baseUrl: snapshot.baseUrl, ...(snapshot.format !== undefined && { format: snapshot.format }) }
}
