import { execFile } from 'node:child_process'
import { folderDialogCommands, folderFromDialogOutput } from './folder-dialog.algorithm'
import type { DialogCommand } from './folder-dialog.algorithm'

/** What a dialog program did: its output, or how it ended. `missing` means the program is not installed. */
export type DialogRun = { output: string } | { cancelled: true } | { missing: true }

/** Runs one dialog program and waits for the person to answer; real by default, replaced in tests. */
export type RunDialog = (command: DialogCommand) => Promise<DialogRun>

/** Runs the program with Node's own `execFile`: no shell, so a path or title is never parsed as a command. */
export const runDialogProgram: RunDialog = async command => await new Promise(resolve => {
  execFile(command.file, command.args, { windowsHide: false, encoding: 'utf8' }, (error, stdout) => {
    if (error === null) {
      resolve({ output: stdout })

      return
    }
    if ('code' in error && error.code === 'ENOENT') {
      resolve({ missing: true })

      return
    }
    // `zenity` and `osascript` exit non-zero when the dialog is closed without a choice.
    resolve(stdout.trim() === '' ? { cancelled: true } : { output: stdout })
  })
})

/**
 * Opens the operating system's own folder dialog on the machine the server
 * runs on, which is where the recipe folder is: a browser tab cannot do it,
 * the server can. Waits until the person picks a folder or closes the dialog.
 *
 * @param platform - `process.platform`; passed in so a test names the platform it means.
 * @param run - How a dialog program is run.
 * @returns The folder picked, or `undefined` when the dialog was closed without a choice.
 * @throws Error when the platform has no dialog program installed (a server with no display, a container).
 */
export async function chooseFolderWithDialog (platform: NodeJS.Platform = process.platform, run: RunDialog = runDialogProgram): Promise<string | undefined> {
  const candidates = folderDialogCommands(platform)
  for (const command of candidates) {
    const result = await run(command)
    if ('missing' in result) continue
    if ('cancelled' in result) return undefined

    return folderFromDialogOutput(result.output)
  }
  const tried = candidates.map(command => command.file).join(' or ')
  throw new Error(`there is no folder dialog on this machine${tried === '' ? '' : ` (${tried} is not installed)`}: type the folder instead`)
}
