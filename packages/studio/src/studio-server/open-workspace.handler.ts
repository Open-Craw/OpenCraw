import { openWorkspace } from '../recipe-workspace'
import type { OpenWorkspaceCommand, WorkspaceView } from '../studio-api'
import { broadcast } from './workspace.store'
import type { StudioState } from './workspace.store'

/**
 * Handles `open-workspace`: reads the folder, remembers it as the server's
 * current workspace (every later command that names a recipe resolves it
 * against this folder), and, when that is a different folder than before,
 * tells every connected client the workspace changed.
 *
 * Only on an actual switch: the UI answers `workspace-changed` with another
 * `open-workspace` of the same folder (its workspace query re-fetches), so a
 * broadcast on every open would answer that re-fetch with another broadcast,
 * for ever — and each round cancels the fetch in flight, so a recipe saved
 * meanwhile never showed up in the listing (found by issue #120's drop flow).
 *
 * @param state - The server state to update.
 * @param command - The command.
 * @returns The workspace's recipes and their issues.
 */
export async function handleOpenWorkspace (state: StudioState, command: OpenWorkspaceCommand): Promise<WorkspaceView> {
  const view = await openWorkspace(command.folder)
  const switched = state.folder !== command.folder
  state.folder = command.folder
  if (switched) broadcast(state, { type: 'workspace-changed' })

  return view
}
