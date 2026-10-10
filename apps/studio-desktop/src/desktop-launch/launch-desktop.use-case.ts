import { menuTemplate } from '../app-menu'
import { forgetFolder, rememberFolder } from '../recent-folders'
import type { DesktopShell, RunningStudio } from './desktop-shell.contract'
import { windowUrl } from './window-url.mapper'

/** What `launchDesktop` is given. Everything that touches the system comes in here, so the logic runs without Electron. */
export interface DesktopLaunchOptions {
  shell:            DesktopShell
  /** Starts the Studio server, with `folder` as its workspace when there is one. */
  startStudio:      (folder: string | undefined) => Promise<RunningStudio>
  /** The recent folders, most recent first, and where they are kept. */
  recent:           { load: () => Promise<string[]>, save: (folders: readonly string[]) => Promise<void> }
  folderExists:     (folder: string) => Promise<boolean>
  /** A folder named on the command line. It wins over the last one used. */
  requestedFolder?: string
}

/** The running desktop app. */
export interface DesktopSession {
  /** Opens a folder in the window (a second launch with a folder, the menu, a drop). */
  open:         (folder: string) => Promise<void>
  /** Shows the native folder dialog and opens what is picked (the menu's Open Folder, and the page's own button). */
  chooseFolder: () => Promise<void>
  focus:        () => void
  /** Stops the server. The window is the caller's to close. */
  stop:         () => Promise<void>
}

/**
 * Starts the desktop app: picks the folder to begin with (the one asked for, else the most recent that
 * still exists), starts Studio on it, shows the window and installs the menu.
 *
 * @param options - The shell, the server starter and the recent-folder store.
 * @returns The running app.
 */
export async function launchDesktop (options: DesktopLaunchOptions): Promise<DesktopSession> {
  const { shell, recent, folderExists } = options
  let remembered = await recent.load()
  const startFolder = options.requestedFolder ?? await firstExisting(remembered, folderExists)
  const studio = await options.startStudio(startFolder)

  const remember = async (next: string[]): Promise<void> => {
    remembered = next
    await recent.save(remembered)
    installMenu()
  }
  const open = async (folder: string): Promise<void> => {
    if (!await folderExists(folder)) {
      shell.reportProblem(`The folder ${folder} is not there any more.`)
      await remember(forgetFolder(remembered, folder))

      return
    }
    await remember(rememberFolder(remembered, folder))
    shell.showWindow(windowUrl(studio.url, folder))
  }
  const installMenu = (): void => {
    shell.setMenu(menuTemplate(shell.platform, remembered, {
      openFolder:  () => { void chooseAndOpen() },
      openRecent:  folder => { void open(folder) },
      clearRecent: () => { void remember([]) },
    }))
  }
  const chooseAndOpen = async (): Promise<void> => {
    const folder = await shell.chooseFolder()
    if (folder !== undefined) await open(folder)
  }

  installMenu()
  if (startFolder === undefined) shell.showWindow(windowUrl(studio.url, undefined))
  else await open(startFolder)

  return { open, chooseFolder: chooseAndOpen, focus: () => { shell.focusWindow() }, stop: studio.close }
}

async function firstExisting (folders: readonly string[], exists: (folder: string) => Promise<boolean>): Promise<string | undefined> {
  for (const folder of folders) {
    if (await exists(folder)) return folder
  }

  return undefined
}
