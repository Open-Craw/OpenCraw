import * as vscode from 'vscode'
import { MCP_HOSTS, configFor, externalSpec } from './mcp-config.algorithm'
import { mcpScript } from './mcp-script.client'

/**
 * "Copy MCP configuration…": for an agent host that is not VS Code's own, asks which one and puts what it needs on the clipboard, with the path of the
 * server this installation carries filled in.
 *
 * @param extensionPath - Where the extension is installed.
 * @param hooksFile - The hooks module the person set, if any.
 */
export async function copyMcpConfiguration (extensionPath: string, hooksFile: () => string | undefined): Promise<void> {
  try {
    const picked = await vscode.window.showQuickPick(MCP_HOSTS.map(host => ({ label: host.label, detail: host.detail, host })), { title: 'Which agent should use OpenCraw?', placeHolder: 'VS Code\'s own agent mode needs nothing: it is already set up. Pick another host to copy its configuration.' })
    if (picked === undefined) return
    const spec = externalSpec(mcpScript(extensionPath), hooksFile())
    await vscode.env.clipboard.writeText(configFor(picked.host.id, spec))
    await vscode.window.showInformationMessage(`OpenCraw: the ${picked.host.label} configuration is on your clipboard. Paste it ${picked.host.id === 'claude-code' ? 'in a terminal' : 'into the host\'s MCP settings'}.`)
  } catch (error) {
    await vscode.window.showErrorMessage(`OpenCraw: ${error instanceof Error ? error.message : String(error)}`)
  }
}
