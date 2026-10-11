import * as vscode from 'vscode'
import { createStudioRunner } from './open-on-opencraw'

/** The extension's entry point, as the editor requires it. */
export function activate (context: vscode.ExtensionContext): void {
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
}

export function deactivate (): void {}
