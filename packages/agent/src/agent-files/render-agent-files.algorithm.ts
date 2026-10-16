import type { AgentSpec } from '../agent-spec'
import { agentsMdSection } from './agents-md-section.mapper'
import type { AgentFile, AgentHost, AgentHostInfo } from './agent-file.contract'
import { claudeSubagentFile } from './claude-subagent.mapper'
import { copilotAgentFile } from './copilot-agent.mapper'

/** The hosts, as a person is offered them. */
export const AGENT_HOSTS: readonly AgentHostInfo[] = [
  { id: 'copilot', label: 'GitHub Copilot (VS Code)', detail: '.github/agents/opencraw.agent.md: a custom agent in the chat' },
  { id: 'claude-code', label: 'Claude Code', detail: '.claude/agents/opencraw.md: a subagent' },
  { id: 'agents-md', label: 'Any coding agent (AGENTS.md)', detail: 'A section of AGENTS.md, which many agents read' },
]

/**
 * The files that put the agent into the hosts chosen.
 *
 * @param spec - The agent.
 * @param hosts - Which hosts.
 * @returns One file per host, in the order of {@link AGENT_HOSTS}.
 */
export function renderAgentFiles (spec: AgentSpec, hosts: readonly AgentHost[]): AgentFile[] {
  const wanted = new Set(hosts)
  const files: AgentFile[] = []
  if (wanted.has('copilot')) files.push(copilotAgentFile(spec))
  if (wanted.has('claude-code')) files.push(claudeSubagentFile(spec))
  if (wanted.has('agents-md')) files.push(agentsMdSection(spec))

  return files
}
