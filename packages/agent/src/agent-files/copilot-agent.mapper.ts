import type { AgentSpec } from '../agent-spec'
import type { AgentFile } from './agent-file.contract'

/** A value in a YAML front matter line, quoted so a colon or a quote in a description cannot break it. */
function yamlString (text: string): string {
  return JSON.stringify(text)
}

/**
 * The agent as a GitHub Copilot custom agent for VS Code: `.github/agents/opencraw.agent.md`, a Markdown file with a front matter of the name and when to
 * pick it, and the instructions as its body. No `tools` list is given, so the agent may use every tool the editor has, OpenCraw’s MCP tools among them.
 *
 * @param spec - The agent.
 * @returns The file.
 */
export function copilotAgentFile (spec: AgentSpec): AgentFile {
  const tools = spec.tools.map(tool => `- \`${spec.mcpServer}/${tool.name}\`: ${tool.use}`).join('\n')
  const content = [
    '---',
    `name: ${yamlString(spec.name)}`,
    `description: ${yamlString(spec.description)}`,
    '---',
    '',
    spec.instructions,
    '',
    '## Your tools',
    '',
    `The OpenCraw MCP server (\`${spec.mcpServer}\`) gives you these. If they are not listed in the agent’s tools, tell the person to start the server (VS Code: the OpenCraw extension registers it; or run **OpenCraw: Copy the MCP configuration**).`,
    '',
    tools,
    '',
  ].join('\n')

  return { host: 'copilot', path: `.github/agents/${spec.id}.agent.md`, mode: 'file', content }
}
