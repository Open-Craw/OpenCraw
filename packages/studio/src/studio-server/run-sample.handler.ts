import { recordLastRun, runSample } from '../sample-run'
import type { RunSampleCommand, StopRunCommand } from '../studio-api'
import { broadcast } from './workspace.store'
import type { StudioState } from './workspace.store'

/**
 * Handles `run-sample`: stops whatever sample was still running (one run at
 * a time), starts the new one, and returns once it has started, not once it
 * finishes: `trace-line` and `record` stream over the WebSocket as the run
 * proceeds, and `run-finished` closes it out.
 *
 * @param state - The server state: `folder` must already be set (`open-workspace` first).
 * @param command - The command.
 * @returns `{ started: true }` once the run has begun.
 * @throws Error when no workspace is open, or the recipe cannot be loaded or bound.
 */
export async function handleRunSample (state: StudioState, command: RunSampleCommand): Promise<{ started: true }> {
  if (state.folder === undefined) throw new Error('open a workspace first')
  await state.activeRun?.stop()
  const handle = await runSample(state.folder, command.recipeId, command.budget, {
    onTraceLine: line => { broadcast(state, { type: 'trace-line', line }) },
    onRecord:    record => { broadcast(state, { type: 'record', recipeId: command.recipeId, key: record.key, data: record.data, scope: record.scope, mapping: record.mapping }) },
    onRejected:  rejected => { broadcast(state, { type: 'record-rejected', recipeId: command.recipeId, field: rejected.field, reason: rejected.reason, scope: rejected.scope }) },
  }, state.browser, state.plugins)
  state.activeRun = handle
  void handle.result.then((result) => {
    if (state.activeRun === handle) state.activeRun = undefined
    recordLastRun(state.lastRuns, command.recipeId, result)
    broadcast(state, { type: 'run-finished', recipeId: result.recipeId, emitted: result.emitted, rejected: result.rejected, duplicates: result.duplicates, durationMs: result.durationMs, error: result.error, stoppedBy: result.stoppedBy })
  })

  return { started: true }
}

/**
 * Handles `stop-run`: closes the crawler of the run in progress, if any.
 * `run-finished` still follows once the interrupted run's promise settles.
 *
 * @param state - The server state holding the active run, if any.
 * @param _command - The command (carries nothing beyond its type).
 * @returns Whether a run was actually in progress to stop.
 */
export async function handleStopRun (state: StudioState, _command: StopRunCommand): Promise<{ stopped: boolean }> {
  const run = state.activeRun
  if (run === undefined) return { stopped: false }
  await run.stop()

  return { stopped: true }
}
