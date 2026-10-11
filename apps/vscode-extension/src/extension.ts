import * as vscode from 'vscode'
import { createStudioRunner } from './open-on-opencraw'

/** What the extension hands to code that activates it: other extensions, and the editor end-to-end test. */
export interface OpenCrawApi {
  /** Fires with each link about to be opened in the browser. */
  onDidResolveLink: vscode.Event<string>
}

/** The extension's entry point, as the editor requires it. */
export function activate (context: vscode.ExtensionContext): OpenCrawApi {
  const runner = createStudioRunner(context.extensionPath)
  context.subscriptions.push(
    vscode.commands.registerCommand('opencraw.openStudio', async () => { await runner.open() }),
    vscode.commands.registerCommand('opencraw.openOn', async (uri?: vscode.Uri) => { await runner.open(uri) }),
    // The hooks file is read when the server starts: a changed setting takes effect from the next open.
    vscode.workspace.onDidChangeConfiguration(change => {
      if (change.affectsConfiguration('opencraw.hooksFile')) runner.restart()
    }),
    { dispose: () => { runner.dispose() } },
  )

  return { onDidResolveLink: runner.onDidResolveLink }
}

export function deactivate (): void {}
