import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The MCP server program the extension carries: in the installed extension it sits in `node_modules`, in a checkout of the repository beside the app.
 *
 * @param extensionPath - Where the extension is installed.
 * @returns The absolute path of the server's entry script.
 * @throws Error when it is in neither place.
 */
export function mcpScript (extensionPath: string): string {
  const candidates = [
    join(extensionPath, 'node_modules', '@opencraw', 'mcp', 'bin', 'opencraw-mcp.mjs'),
    join(extensionPath, '..', '..', 'packages', 'mcp', 'bin', 'opencraw-mcp.mjs'),
  ]
  const found = candidates.find(candidate => existsSync(candidate))
  if (found === undefined) throw new Error('the OpenCraw MCP server is missing from this installation: reinstall the extension')

  return found
}
