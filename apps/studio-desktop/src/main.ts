import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { startStudioServer } from '@opencraw/studio'
import { app } from 'electron'
import { folderArgument, launchDesktop } from './desktop-launch'
import type { DesktopSession } from './desktop-launch'
import { createElectronShell } from './electron-shell'
import { createRecentFoldersRepository } from './recent-folders'

function absolute (folder: string | undefined, base: string): string | undefined {
  return folder === undefined ? undefined : resolve(base, folder)
}

async function folderExists (folder: string): Promise<boolean> {
  try {
    const found = await stat(folder)

    return found.isDirectory()
  } catch {
    return false
  }
}

/**
 * The desktop app: one instance, one window, the Studio server in this process. Closing the window
 * quits, and quitting stops the server (and with it any sample run or recording).
 */
async function run (): Promise<void> {
  await app.whenReady()
  const recentFile = join(app.getPath('userData'), 'recent-folders.json')
  const session: DesktopSession = await launchDesktop({
    shell:           createElectronShell(),
    startStudio:     async folder => await startStudioServer({ initialFolder: folder }),
    recent:          createRecentFoldersRepository(recentFile),
    folderExists,
    requestedFolder: absolute(folderArgument(process.argv, app.isPackaged), process.cwd()),
  })
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const folder = absolute(folderArgument(argv, app.isPackaged), workingDirectory)
    if (folder === undefined) session.focus()
    else void session.open(folder)
  })
  let stopping = false
  app.on('before-quit', event => {
    if (stopping) return
    stopping = true
    event.preventDefault()
    void session.stop().finally(() => { app.exit(0) })
  })
  app.on('window-all-closed', () => { app.quit() })
}

if (app.requestSingleInstanceLock()) void run()
else app.quit()
