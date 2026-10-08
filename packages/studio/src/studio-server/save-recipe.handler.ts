import { invalidateStaleSnapshot } from '../page-snapshot'
import { saveRecipe } from '../recipe-workspace'
import type { SaveRecipeCommand } from '../studio-api'
import { broadcast } from './workspace.store'
import type { StudioState } from './workspace.store'

/**
 * Handles `save-recipe`: writes the file (see `recipe-workspace/save-recipe.use-case.ts`
 * for the pretty-printing and its round-trip guarantee), then tells every
 * connected client the workspace changed, so the UI can re-fetch it.
 *
 * @param state - The server state holding the connected sockets.
 * @param command - The command: the file path and the whole recipe object.
 * @returns `{ saved: true }` once the write has completed.
 */
export async function handleSaveRecipe (state: StudioState, command: SaveRecipeCommand): Promise<{ saved: true }> {
  const recipe = command.recipe
  await invalidateStaleSnapshot(state.snapshots, command.path, recipe)
  await saveRecipe(command.path, recipe)
  broadcast(state, { type: 'workspace-changed' })

  return { saved: true }
}
