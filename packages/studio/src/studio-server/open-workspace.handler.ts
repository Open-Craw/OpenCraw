import { openWorkspace } from '../recipe-workspace'
import type { OpenWorkspaceCommand, WorkspaceView } from '../studio-api'
import { broadcast } from './workspace.store'
import type { StudioState } from './workspace.store'

/**
 * Handles `open-workspace`: reads the folder, remembers it as the server's
 * current workspace (every later command that names a recipe resolves it
 * against this folder), and tells every connected client the workspace changed.
 *
 * @param state - The server state to update.
 * @param command - The command.
 * @returns The workspace's recipes and their issues.
 */
export async function handleOpenWorkspace (state: StudioState, command: OpenWorkspaceCommand): Promise<WorkspaceView> {
  const view = await openWorkspace(command.folder)
  state.folder = command.folder
  broadcast(state, { type: 'workspace-changed' })

  return view
}
