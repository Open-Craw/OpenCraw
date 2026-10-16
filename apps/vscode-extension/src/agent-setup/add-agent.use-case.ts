import { OPENCRAW_AGENT, renderAgentFiles } from '@opencraw/agent'
import type { AgentHost } from '@opencraw/agent'
import * as vscode from 'vscode'
import { planAgentWrites } from './agent-write-plan.algorithm'

/** The text of a file in the workspace, or `undefined` when it is not there. */
async function readIfThere (uri: vscode.Uri): Promise<string | undefined> {
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
  } catch {
    return undefined
  }
}

/** The folder the agent goes into: the only one open, or the one the person picks. */
async function targetFolder (): Promise<vscode.Uri | undefined> {
  const folders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file')
  if (folders.length === 0) {
    await vscode.window.showWarningMessage('OpenCraw: open a folder first: the agent file is written into your workspace.')

    return undefined
  }
  if (folders.length === 1) return folders[0].uri
  const picked = await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Which folder should get the OpenCraw agent?' })

  return picked?.uri
}

/**
 * Writes the OpenCraw agent into the workspace for the hosts chosen: a Copilot custom agent, a Claude Code subagent, a section of AGENTS.md. A file that
 * is not there is created; the agent’s own file, when it exists and differs, is replaced only if the person says so (they may have changed it); an
 * AGENTS.md keeps everything the person wrote and only our section is updated.
 *
 * @param hosts - Which hosts.
 * @param folder - The workspace folder; the only one open (or a pick) when omitted.
 * @returns The workspace-relative paths written; empty when nothing was.
 */
export async function addAgent (hosts: readonly AgentHost[], folder?: vscode.Uri): Promise<string[]> {
  const root = folder ?? await targetFolder()
  if (root === undefined || hosts.length === 0) return []
  const files = renderAgentFiles(OPENCRAW_AGENT, hosts)
  const existing = new Map<string, string | undefined>()
  for (const file of files) existing.set(file.path, await readIfThere(vscode.Uri.joinPath(root, file.path)))
  const written: string[] = []
  for (const write of planAgentWrites(files, existing)) {
    if (write.action === 'unchanged') continue
    if (write.action === 'replace') {
      const answer = await vscode.window.showWarningMessage(`${write.path} already exists and differs from the agent OpenCraw ships. Replace it?`, { modal: true }, 'Replace')
      if (answer !== 'Replace') continue
    }
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, write.path), new TextEncoder().encode(write.content))
    written.push(write.path)
  }

  return written
}
