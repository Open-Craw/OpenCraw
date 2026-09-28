import { responsesSeen } from '../page-inspector'
import { loadRecipePair } from '../sample-run'
import type { ResponsesSeenCommand, ResponsesSeenView } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `responses-seen`: the JSON responses observed while a recipe's
 * start page rendered (`page-inspector`'s `responses-seen.use-case.ts`,
 * issue #93), for the Inspect panel's "responses seen" list — picking one
 * is the seam the UI uses to switch the recipe to api mode (issue #93's
 * acceptance; the JSON tree canvas that follows is phase 5's).
 *
 * @param state - The server state: `folder` must already be set.
 * @param command - The command.
 * @returns The observed responses.
 * @throws Error when no workspace is open, or the recipe cannot be found or loaded.
 */
export async function handleResponsesSeen (state: StudioState, command: ResponsesSeenCommand): Promise<ResponsesSeenView> {
  if (state.folder === undefined) throw new Error('open a workspace first')
  const { input } = await loadRecipePair(state.folder, command.recipeId)
  const responses = await responsesSeen(input, command.path, state.browser)

  return { responses }
}
