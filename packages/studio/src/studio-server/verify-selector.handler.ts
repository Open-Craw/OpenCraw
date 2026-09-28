import { countMatches } from '@opencraw/core'
import { cachedSnapshot, fetchStartPage } from '../page-snapshot'
import { loadRecipePair } from '../sample-run'
import type { VerifySelectorCommand, VerifySelectorView } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `verify-selector`: runs a candidate through the engine's own
 * selection (`@opencraw/core`'s `countMatches`) against the cached
 * snapshot, and, best-effort, against the live page too — issue #91's "flag
 * a selector that matches the snapshot but not the live page". The live
 * page is fetched raw (`page-snapshot`'s `fetchStartPage`, the same reach
 * `take-snapshot` has: only `"start"` today), not through the rewritten
 * snapshot, so its match count is the site's own, not the studio's.
 *
 * @param state - The server state.
 * @param command - The command; `command.path` must already have a cached snapshot (call `take-snapshot` first).
 * @returns The match counts.
 * @throws Error when no workspace is open, the recipe cannot be found, or `command.path` has no cached snapshot yet.
 */
export async function handleVerifySelector (state: StudioState, command: VerifySelectorCommand): Promise<VerifySelectorView> {
  if (state.folder === undefined) throw new Error('open a workspace first')
  const snapshot = cachedSnapshot(state.snapshots, command.recipeId, command.path)
  if (snapshot === undefined) throw new Error(`no cached snapshot for "${command.recipeId}" at "${command.path}": call take-snapshot first`)
  const snapshotMatches = countMatches(snapshot.html, command.selector)
  if (command.path !== 'start') return { selector: command.selector, snapshotMatches, liveChecked: false, liveError: 'only the start page can be checked against the live site for now' }
  try {
    const { input } = await loadRecipePair(state.folder, command.recipeId)
    const live = await fetchStartPage(input)

    return { selector: command.selector, snapshotMatches, liveChecked: true, liveMatches: countMatches(live, command.selector) }
  } catch (error) {
    return { selector: command.selector, snapshotMatches, liveChecked: false, liveError: error instanceof Error ? error.message : String(error) }
  }
}
