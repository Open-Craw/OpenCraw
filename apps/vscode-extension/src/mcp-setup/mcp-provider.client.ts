import * as vscode from 'vscode'
import { mcpScript } from './mcp-script.client'

/** The id `package.json` declares the provider under (`mcpServerDefinitionProviders`). */
export const MCP_PROVIDER_ID = 'opencraw.mcp'

/**
 * Makes OpenCraw's tools available to VS Code's own agent mode with nothing to set up: the editor asks this provider which MCP servers exist and starts
 * the one the extension carries, with its own executable as plain Node (`ELECTRON_RUN_AS_NODE`), as the Studio process is started.
 *
 * @param extensionPath - Where the extension is installed.
 * @param version - The extension's version, so the editor knows when the server changed.
 * @param hooksFile - The hooks module the person set, if any: the server's recipes may call it.
 * @returns The registration, and a function to call when the hooks setting changes so the editor asks again.
 */
export function registerOpenCrawMcp (extensionPath: string, version: string, hooksFile: () => string | undefined): { registration: vscode.Disposable, changed: () => void } {
  const changed = new vscode.EventEmitter<void>()
  const registration = vscode.lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
    onDidChangeMcpServerDefinitions: changed.event,
    provideMcpServerDefinitions:     () => {
      const hooks = hooksFile()

      return [new vscode.McpStdioServerDefinition('OpenCraw', process.execPath, [mcpScript(extensionPath)], { ELECTRON_RUN_AS_NODE: '1', ...(hooks !== undefined && { OPENCRAW_HOOKS: hooks }) }, version)]
    },
  })

  return { registration: vscode.Disposable.from(registration, changed), changed: () => { changed.fire() } }
}
