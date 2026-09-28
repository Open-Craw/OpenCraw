import { explainWhy } from '../explain-why'
import { loadRecipePair } from '../sample-run'
import type { ExplainWhyCommand, WhyView } from '../studio-api'
import type { StudioState } from './workspace.store'

/**
 * Handles `explain-why` (issue #92's Why? tab): builds the sentence for a
 * missing or rejected value from the recipe's last sample run, kept in
 * `state.lastRuns` by `handleRunSample`.
 *
 * @param state - The server state: `folder` must already be set (`open-workspace` first).
 * @param command - The command.
 * @returns The explanation.
 * @throws Error when no workspace is open, no sample run has finished for the target's recipe, or the target does not name a real record/field.
 */
export async function handleExplainWhy (state: StudioState, command: ExplainWhyCommand): Promise<WhyView> {
  if (state.folder === undefined) throw new Error('open a workspace first')

  return explainWhy(state.folder, state.lastRuns, loadRecipePair, command.target)
}
