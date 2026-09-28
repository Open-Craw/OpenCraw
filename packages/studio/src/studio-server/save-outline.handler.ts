import { saveRecipe } from '../recipe-workspace'
import { outlineToRecipe } from '../scope-outline'
import type { SaveOutlineCommand } from '../studio-api'
import { broadcast } from './workspace.store'
import type { StudioState } from './workspace.store'

/**
 * Handles `save-outline`: the Steps tab's edits, as the outline it holds
 * locally, converted back to the recipe's JSON (`scope-outline`'s
 * `outlineToRecipe`, so the conversion runs here rather than in the
 * browser) and written the same way `save-recipe` writes the JSON tab's
 * edits. Every connected client, including the sender, is told the
 * workspace changed, so both tabs re-fetch it and stay in sync.
 *
 * @param state - The server state holding the connected sockets.
 * @param command - The command: the file path and the edited outline.
 * @returns `{ saved: true }` once the write has completed.
 */
export async function handleSaveOutline (state: StudioState, command: SaveOutlineCommand): Promise<{ saved: true }> {
  await saveRecipe(command.path, outlineToRecipe(command.outline))
  broadcast(state, { type: 'workspace-changed' })

  return { saved: true }
}
