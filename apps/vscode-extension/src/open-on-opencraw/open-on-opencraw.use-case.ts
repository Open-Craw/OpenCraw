import { isAbsolute, join } from 'node:path'
import * as vscode from 'vscode'
import { openTargetFor } from '../open-target'
import { startStudioProcess } from '../studio-host'
import type { StudioProcess } from '../studio-host'

/** Where the editor extension runs its own server: one process per editor window, started on first use. */
export interface StudioRunner {
  /** Opens `uri` (a file or a folder; the active file when omitted, else Studio on the workspace folder) in the browser. */
  open:             (uri?: vscode.Uri) => Promise<void>
  /** Stops the server; called when the extension is deactivated. */
  dispose:          () => void
  /** Stops the server so the next "Open on OpenCraw" starts it again, with the settings as they are then. */
  restart:          () => void
  /** Fires with each link the runner is about to open in the browser: how a test, or another extension, sees where an open went. */
  onDidResolveLink: vscode.Event<string>
}

/** The folders the editor has open, as file system paths. */
function workspaceFolders (): string[] {
  return (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath)
}

/**
 * Studio's Open folder…, answered with the editor's own folder dialog: the operating system's picker, or the
 * remote machine's in a remote window, where the server runs and the recipe folder is.
 *
 * @returns The folder picked, or `undefined` when the dialog was closed without a choice.
 */
async function pickFolder (): Promise<string | undefined> {
  const [picked] = await vscode.window.showOpenDialog({
    canSelectFiles:   false,
    canSelectFolders: true,
    canSelectMany:    false,
    title:            'Choose the recipe folder',
    openLabel:        'Open folder',
    defaultUri:       vscode.workspace.workspaceFolders?.[0]?.uri,
  }) ?? []

  return picked?.fsPath
}

/**
 * The hooks module the person named in their user settings, if any.
 *
 * @returns The absolute path, or `undefined` when the setting is empty.
 * @throws Error when the setting is not an absolute path: a user setting has no folder to be relative to.
 */
function hooksFile (): string | undefined {
  const named = vscode.workspace.getConfiguration('opencraw').get<string>('hooksFile', '').trim()
  if (named === '') return undefined
  if (!isAbsolute(named)) throw new Error(`the setting opencraw.hooksFile must be an absolute path, not "${named}"`)

  return named
}

/**
 * The extension's one outcome: show a folder, a recipe or a document in
 * Studio, in the person's own browser. The server starts on first use and
 * serves until the window closes; each "Open on OpenCraw" asks it for a link
 * to the picked path and opens that link.
 *
 * @param extensionPath - Where the extension is installed: `studio-host.process.mjs` sits in its `dist`.
 * @returns The runner.
 */
export function createStudioRunner (extensionPath: string): StudioRunner {
  const script = join(extensionPath, 'dist', 'studio-host.process.mjs')
  const resolved = new vscode.EventEmitter<string>()
  let running: Promise<StudioProcess> | undefined

  async function start (): Promise<StudioProcess> {
    try {
      const process = await startStudioProcess({ script, workspace: workspaceFolders()[0], hooks: hooksFile(), chooseFolder: pickFolder })
      void process.ended.then(() => { running = undefined })

      return process
    } catch (error) {
      running = undefined
      throw error
    }
  }

  const studio = async (): Promise<StudioProcess> => {
    running ??= start()

    return await running
  }

  return {
    open: async uri => {
      try {
        const picked = uri ?? vscode.window.activeTextEditor?.document.uri
        if (picked !== undefined && picked.scheme !== 'file') {
          await vscode.window.showWarningMessage('OpenCraw can only open files and folders on disk.')

          return
        }
        const target = picked === undefined ? {} : openTargetFor(picked.fsPath, workspaceFolders())
        const server = await studio()
        const link = await server.link(target)
        resolved.fire(link)
        // In a remote window (SSH, WSL, Codespaces) the server runs on the remote machine: this forwards its port.
        await vscode.env.openExternal(await vscode.env.asExternalUri(vscode.Uri.parse(link)))
      } catch (error) {
        await vscode.window.showErrorMessage(`OpenCraw: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    dispose: () => {
      void running?.then(process => { process.dispose() })
    },
    restart: () => {
      const stopped = running
      running = undefined
      void stopped?.then(process => { process.dispose() })
    },
    onDidResolveLink: resolved.event,
  }
}
