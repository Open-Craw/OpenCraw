import { openRecorderSession } from '../flow-recording'
import { loadRecipePair } from '../sample-run'
import type { StartRecordingCommand, StopRecordingCommand } from '../studio-api'
import { broadcast } from './workspace.store'
import type { StudioState } from './workspace.store'

/**
 * Handles `start-recording`: opens the studio's own headed browser window
 * on the named recipe's start point (issue #95, phase 6) and streams
 * `recording-card`/`recording-note` events as the person drives it. One
 * recording at a time, like one sample run at a time: a second
 * `start-recording` stops whatever was already open first.
 *
 * @param state - The server state: `folder` must already be set, `recorderProfileDir` names the studio's own recorder profile (never a crawl's own, never the person's default browser).
 * @param command - The command.
 * @returns `{ started: true }` once the window is open.
 * @throws Error when no workspace is open, or the recipe cannot be found or loaded.
 */
export async function handleStartRecording (state: StudioState, command: StartRecordingCommand): Promise<{ started: true }> {
  if (state.folder === undefined) throw new Error('open a workspace first')
  await state.activeRecording?.stop()
  const { input } = await loadRecipePair(state.folder, command.recipeId)
  const point = input.start[0]
  if (point === undefined) throw new Error(`recipe "${command.recipeId}" has no start point`)
  const handle = await openRecorderSession(
    { startUrl: point.url, profileDir: state.recorderProfileDir, browser: state.browser },
    {
      onCard: (node, secret) => { broadcast(state, { type: 'recording-card', node, secret }) },
      onNote: (note) => { broadcast(state, { type: 'recording-note', kind: note.kind, message: note.message }) },
    },
  )
  state.activeRecording = handle

  return { started: true }
}

/**
 * Handles `stop-recording`: closes the recording window, if one is open,
 * and answers with every step recorded, in order — enough for the caller to
 * build "make this the login" (`session.bootstrap`) or "keep as steps"
 * without asking the server again. Also broadcasts `recording-stopped`, so
 * every connected client (not only the one that asked) knows the window
 * closed.
 *
 * @param state - The server state holding the active recording, if any.
 * @param _command - The command (carries nothing beyond its type).
 * @returns Every step recorded, in order; empty when nothing was recording.
 */
export async function handleStopRecording (state: StudioState, _command: StopRecordingCommand): Promise<{ steps: Record<string, unknown>[] }> {
  const recording = state.activeRecording
  state.activeRecording = undefined
  if (recording === undefined) return { steps: [] }
  const { steps } = await recording.stop()
  broadcast(state, { type: 'recording-stopped', steps })

  return { steps }
}
