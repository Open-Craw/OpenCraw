import type { AgentSpec } from '../agent-spec'
import type { AgentFile } from './agent-file.contract'

/**
 * The agent as a Claude Code subagent: `.claude/agents/opencraw.md`, a Markdown file whose front matter names it and says when to use it, and whose body
 * is the instructions. No `tools` line is given, so it inherits every tool, the OpenCraw MCP server’s among them.
 *
 * @param spec - The agent.
 * @returns The file.
 */
export function claudeSubagentFile (spec: AgentSpec): AgentFile {
  const tools = spec.tools.map(tool => `- \`mcp__${spec.mcpServer}__${tool.name}\`: ${tool.use}`).join('\n')
  // The description is one line of plain text in the front matter; Claude Code reads “use proactively” as a hint to delegate to it.
  const description = `${spec.description} Use proactively for anything about OpenCraw recipes, extracting data, or Studio.`
  const content = [
    '---',
    `name: ${spec.id}`,
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
    spec.instructions,
    '',
    '## Your tools',
    '',
    `The OpenCraw MCP server (\`${spec.mcpServer}\`) gives you these. If they are missing, tell the person to add the server (\`claude mcp add\`; the VS Code extension’s **Copy the MCP configuration** prints the line).`,
    '',
    tools,
    '',
  ].join('\n')

  return { host: 'claude-code', path: `.claude/agents/${spec.id}.md`, mode: 'file', content }
}
