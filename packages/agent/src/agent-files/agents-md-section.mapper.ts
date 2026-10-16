import type { AgentSpec } from '../agent-spec'
import type { AgentFile } from './agent-file.contract'

export const SECTION_BEGIN = '<!-- opencraw-agent:begin -->'
export const SECTION_END = '<!-- opencraw-agent:end -->'

/**
 * The agent as a section of `AGENTS.md`, the file coding agents of many makers read: its instructions between two markers, so the section can be
 * updated later without touching the rest of the person’s file.
 *
 * @param spec - The agent.
 * @returns The file, as a section.
 */
export function agentsMdSection (spec: AgentSpec): AgentFile {
  const tools = spec.tools.map(tool => `- \`${tool.name}\` (MCP server \`${spec.mcpServer}\`): ${tool.use}`).join('\n')
  const content = [
    SECTION_BEGIN,
    '## The OpenCraw agent',
    '',
    `When the person asks about OpenCraw, recipes, extracting data from pages or files, or Studio, work as the OpenCraw specialist: ${spec.description}`,
    '',
    spec.instructions.replace(/^# .*\n+/, ''),
    '',
    '### Your tools',
    '',
    tools,
    SECTION_END,
    '',
  ].join('\n')

  return { host: 'agents-md', path: 'AGENTS.md', mode: 'section', content }
}

/**
 * Puts the agent’s section into an existing `AGENTS.md`: replaces our section if it is there, else adds it at the end. Everything else in the file stays as
 * the person wrote it, so running it twice changes nothing.
 *
 * @param existing - The file’s current content; `undefined` or empty when there is none.
 * @param section - The section, markers included.
 * @returns The new content.
 */
export function mergeSection (existing: string | undefined, section: string): string {
  if (existing === undefined || existing.trim() === '') return section
  const start = existing.indexOf(SECTION_BEGIN)
  const end = existing.indexOf(SECTION_END)
  if (start !== -1 && end > start) return `${existing.slice(0, start)}${section.trimEnd()}${existing.slice(end + SECTION_END.length)}`

  return `${existing.trimEnd()}\n\n${section}`
}
