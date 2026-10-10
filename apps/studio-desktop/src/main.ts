import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { loadPlugins } from '@opencraw/cli'
import { startStudioServer } from '@opencraw/studio'
import type { TrustedPlugins } from '@opencraw/studio'
import { app, dialog, ipcMain } from 'electron'
import { CHOOSE_FOLDER_CHANNEL } from './desktop-bridge'
import { folderArgument, hooksArgument, launchDesktop } from './desktop-launch'
import type { DesktopSession } from './desktop-launch'
import { createElectronShell } from './electron-shell'
import { createRecentFoldersRepository } from './recent-folders'
import { createWindowBoundsRepository } from './window-bounds'
import type { WindowBounds } from './window-bounds'

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
 * Loads the hooks file named at launch (`--hooks <file>`, or OPENCRAW_PLUGINS), on the launch's own
 * authority exactly as `opencraw studio --hooks` does: the server never loads code itself.
 *
 * @returns The plugins, `undefined` when none were named, or the load error's message.
 */
async function launchPlugins (): Promise<TrustedPlugins | undefined | Error> {
  const named = absolute(hooksArgument(process.argv, app.isPackaged, process.env), process.cwd())
  if (named === undefined) return undefined
  try {
    return { source: named, ...await loadPlugins(named) }
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

/**
 * The desktop app: one instance, one window, the Studio server in this process. Closing the window
 * quits, and quitting stops the server (and with it any sample run or recording).
 */
async function run (): Promise<void> {
  await app.whenReady()
  const plugins = await launchPlugins()
  if (plugins instanceof Error) {
    dialog.showErrorBox('OpenCraw Studio', plugins.message)
    app.exit(1)

    return
  }
  const recentFile = join(app.getPath('userData'), 'recent-folders.json')
  const boundsRepository = createWindowBoundsRepository(join(app.getPath('userData'), 'window-bounds.json'))
  const boundsSaves: Promise<void>[] = []
  const saveBounds = async (bounds: WindowBounds): Promise<void> => {
    try {
      await boundsRepository.save(bounds)
    } catch {
      // the window's place is a convenience; failing to keep it must not get in the way of quitting
    }
  }
  const shell = createElectronShell({
    initialBounds: await boundsRepository.load(),
    onBounds:      bounds => { boundsSaves.push(saveBounds(bounds)) },
  })
  const session: DesktopSession = await launchDesktop({
    shell,
    startStudio:     async folder => await startStudioServer({ initialFolder: folder, plugins }),
    recent:          createRecentFoldersRepository(recentFile),
    folderExists,
    requestedFolder: absolute(folderArgument(process.argv, app.isPackaged), process.cwd()),
  })
  ipcMain.handle(CHOOSE_FOLDER_CHANNEL, async () => { await session.chooseFolder() })
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const folder = absolute(folderArgument(argv, app.isPackaged), workingDirectory)
    if (folder === undefined) session.focus()
    else void session.open(folder)
  })
  const finish = async (): Promise<void> => {
    await session.stop()
    await Promise.all(boundsSaves)
  }
  let stopping = false
  app.on('before-quit', event => {
    if (stopping) return
    stopping = true
    event.preventDefault()
    shell.reportPlace()
    void finish().finally(() => { app.exit(0) })
  })
  app.on('window-all-closed', () => { app.quit() })
}

if (app.requestSingleInstanceLock()) void run()
else app.quit()
