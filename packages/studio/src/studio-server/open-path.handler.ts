import { openPath } from '../recipe-workspace'
import type { OpenPathCommand, OpenPathView } from '../studio-api'

/**
 * Handles `open-path`: says what the path is (folder, recipe or document) and
 * where to open it. Opens nothing itself: the UI follows with `open-workspace`
 * on the answer's folder, the same as when the folder is typed.
 *
 * @param command - The path, and the workspace it should belong to if the caller has one.
 * @returns What the path is.
 */
export async function handleOpenPath (command: OpenPathCommand): Promise<OpenPathView> {
  return await openPath(command.path, command.workspace)
}
