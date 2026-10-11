import type { ChooseFolderView } from '../studio-api'
import type { StudioState } from './workspace.store'

/** Asks the dialog, and clears `openDialog` once it has answered or failed, so the next request opens a new one. */
async function askOnce (state: StudioState, ask: () => Promise<string | undefined>): Promise<string | undefined> {
  try {
    return await ask()
  } finally {
    state.openDialog = undefined
  }
}

/**
 * Handles `choose-folder`: opens the folder dialog of the machine the server
 * runs on and answers the folder picked. Only answers: the UI follows with
 * `open-workspace`, the same as when the folder is typed. A dialog still
 * open is not opened a second time; the second request waits for the first.
 *
 * @param state - The server state holding the dialog to use.
 * @returns The folder, or none when the dialog was closed.
 */
export async function handleChooseFolder (state: StudioState): Promise<ChooseFolderView> {
  if (state.chooseFolder === undefined) throw new Error('this server has no folder dialog: type the folder instead')
  state.openDialog ??= askOnce(state, state.chooseFolder)
  const folder = await state.openDialog

  return folder === undefined ? {} : { folder }
}
