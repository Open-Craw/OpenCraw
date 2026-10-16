/** How to start the OpenCraw MCP server: a program and what it is given. */
export interface McpServerSpec {
  command: string
  args:    string[]
  env:     Record<string, string>
}

/** A host an AI agent runs in, and how it is told about an MCP server. */
export interface McpHost {
  id:     'claude-code' | 'cursor' | 'json'
  label:  string
  detail: string
}

export const MCP_HOSTS: readonly McpHost[] = [
  { id: 'claude-code', label: 'Claude Code', detail: 'A `claude mcp add` command to paste in a terminal' },
  { id: 'cursor', label: 'Cursor', detail: 'The `mcpServers` entry for .cursor/mcp.json' },
  { id: 'json', label: 'Any other host', detail: 'The common `mcpServers` JSON most hosts read' },
]

/**
 * The server as an agent host outside this editor starts it: with `node`, which a person who uses such a host has, and the absolute path of the
 * server the extension carries. (Inside VS Code the extension registers the server itself and needs none of this.)
 *
 * @param script - The absolute path of the bundled MCP server.
 * @param hooks - The person's hooks module, when they set one, so an agent can run recipes that use it.
 * @returns How to start it.
 */
export function externalSpec (script: string, hooks?: string): McpServerSpec {
  return { command: 'node', args: [script], env: hooks === undefined ? {} : { OPENCRAW_HOOKS: hooks } }
}

/** A shell argument, quoted when it holds a space or a character a shell reads. */
function shellQuote (text: string): string {
  return /^[\w./:=@%+-]+$/.test(text) ? text : `"${text.replaceAll('"', String.raw`\"`)}"`
}

/**
 * What to hand an agent host so it can start the server.
 *
 * @param host - Which host.
 * @param spec - How to start the server.
 * @returns Text for the clipboard.
 */
export function configFor (host: McpHost['id'], spec: McpServerSpec): string {
  if (host === 'claude-code') {
    const env = Object.entries(spec.env).map(([name, value]) => `--env ${shellQuote(`${name}=${value}`)}`)

    return ['claude mcp add opencraw', ...env, '--', spec.command, ...spec.args.map(arg => shellQuote(arg))].join(' ')
  }
  const entry = { command: spec.command, args: spec.args, ...(Object.keys(spec.env).length > 0 && { env: spec.env }) }

  return `${JSON.stringify({ mcpServers: { opencraw: entry } }, undefined, 2)}\n`
}
