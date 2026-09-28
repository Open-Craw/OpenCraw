import { fetchStartPage } from '../page-snapshot'
import { loadRecipePair } from '../sample-run'
import type { FetchStartPageCommand, StartPageView } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `fetch-start-page`: loads the named input recipe from the current
 * workspace and fetches its start point (see `page-snapshot`'s own caveats:
 * no session bootstrap, a fresh browser or HTTP context per call).
 *
 * @param state - The server state: `folder` must already be set.
 * @param command - The command.
 * @returns The page's content as plain text.
 * @throws Error when no workspace is open, or the recipe cannot be found or loaded.
 */
export async function handleFetchStartPage (state: StudioState, command: FetchStartPageCommand): Promise<StartPageView> {
  if (state.folder === undefined) throw new Error('open a workspace first')
  const { input } = await loadRecipePair(state.folder, command.recipeId)
  const html = await fetchStartPage(input)

  return { html }
}
