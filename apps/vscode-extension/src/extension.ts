import * as vscode from 'vscode'
import { createStudioRunner } from './open-on-opencraw'

/** The extension's entry point, as the editor requires it. */
export function activate (context: vscode.ExtensionContext): void {
  const runner = createStudioRunner(context.extensionPath)
  context.subscriptions.push(
    vscode.commands.registerCommand('opencraw.openStudio', async () => { await runner.open() }),
    vscode.commands.registerCommand('opencraw.openOn', async (uri?: vscode.Uri) => { await runner.open(uri) }),
    { dispose: () => { runner.dispose() } },
  )
}

export function deactivate (): void {}
