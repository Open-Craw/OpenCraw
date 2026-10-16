import { AGENT_HOSTS } from '@opencraw/agent'
import * as vscode from 'vscode'
import { addAgent } from './add-agent.use-case'

/**
 * “Add the OpenCraw agent to this workspace…”: asks which agents the person uses (more than one is fine), writes the agent for each, and offers to open
 * what was written. The agent is the same specialist whichever host reads it.
 */
export async function addAgentCommand (): Promise<void> {
  try {
    const picked = await vscode.window.showQuickPick(AGENT_HOSTS.map(host => ({ label: host.label, detail: host.detail, host: host.id, picked: host.id === 'copilot' })), {
      canPickMany: true,
      title:       'Add the OpenCraw agent for…',
      placeHolder: 'A specialist who reads your pages and files and builds the recipes with you. Pick every agent you use.',
    })
    if (picked === undefined || picked.length === 0) return
    const root = vscode.workspace.workspaceFolders?.[0]?.uri
    const written = await addAgent(picked.map(item => item.host))
    if (written.length === 0) return
    const choice = await vscode.window.showInformationMessage(`OpenCraw: the agent was added (${written.join(', ')}). Make sure OpenCraw’s tools are on in your agent: in VS Code they already are.`, 'Open')
    if (choice === 'Open' && root !== undefined) await vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(root, written[0]))
  } catch (error) {
    await vscode.window.showErrorMessage(`OpenCraw: ${error instanceof Error ? error.message : String(error)}`)
  }
}
