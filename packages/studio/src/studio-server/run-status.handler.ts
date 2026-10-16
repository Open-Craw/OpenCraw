import { lastRunOf } from '../sample-run'
import type { RunStatusCommand, RunStatusView } from '../studio-api'
import type { StudioState } from './workspace.store'

/** How many records and rejections a status carries: enough to judge a run, the rest stay in Studio. */
const FIRST = 20

/**
 * Handles `run-status`: how a recipe's sample run is going, for a controller that started it and cannot watch
 * the event stream. A run in progress is `running`; one that finished carries its counts and first records.
 *
 * @param state - The server state holding the run in progress and the last runs.
 * @param command - The recipe asked about.
 * @returns The state of the recipe's sample run.
 */
export function handleRunStatus (state: StudioState, command: RunStatusCommand): RunStatusView {
  if (state.activeRun !== undefined && state.activeRunId === command.recipeId) return { recipeId: command.recipeId, state: 'running' }
  const last = lastRunOf(state.lastRuns, command.recipeId)
  if (last === undefined) return { recipeId: command.recipeId, state: 'never-run' }
  const { result } = last

  return {
    recipeId: command.recipeId,
    state:    'finished',
    result:   {
      emitted:    result.emitted,
      rejected:   result.rejected,
      duplicates: result.duplicates,
      durationMs: result.durationMs,
      error:      result.error,
      stoppedBy:  result.stoppedBy,
      records:    result.records.slice(0, FIRST).map(record => ({ key: record.key, data: record.data })),
      rejections: result.rejectedRecords.slice(0, FIRST).map(rejection => ({ field: rejection.field, reason: rejection.reason, url: rejection.url })),
    },
  }
}
