import { parse } from 'yaml'
import { OPENCRAW_AGENT } from '../agent-spec'
import { SECTION_BEGIN, SECTION_END, agentsMdSection, mergeSection } from './agents-md-section.mapper'
import { claudeSubagentFile } from './claude-subagent.mapper'
import { copilotAgentFile } from './copilot-agent.mapper'
import { AGENT_HOSTS, renderAgentFiles } from './render-agent-files.algorithm'

/** The front matter of a Markdown file, parsed. */
function frontMatter (content: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content)
  if (match === null) throw new Error('no front matter')

  return parse(match[1]) as Record<string, unknown>
}

describe('copilotAgentFile', () => {
  const file = copilotAgentFile(OPENCRAW_AGENT)

  it('is a custom agent file of the workspace, with a front matter that parses and the instructions as its body', () => {
    expect(file).toMatchObject({ host: 'copilot', path: '.github/agents/opencraw.agent.md', mode: 'file' })
    expect(frontMatter(file.content)).toEqual({ name: 'OpenCraw', description: OPENCRAW_AGENT.description })
    expect(file.content).toContain('# OpenCraw agent')
  })

  it('lists the MCP tools by their name on the server', () => {
    expect(file.content).toContain('`opencraw/probe`')
    expect(file.content).toContain('`opencraw/docs`')
  })
})

describe('claudeSubagentFile', () => {
  const file = claudeSubagentFile(OPENCRAW_AGENT)

  it('is a subagent file with its name, a one-line description to delegate by and the instructions', () => {
    expect(file).toMatchObject({ host: 'claude-code', path: '.claude/agents/opencraw.md', mode: 'file' })
    const front = frontMatter(file.content)
    expect(front.name).toBe('opencraw')
    expect(String(front.description)).toContain('Use proactively')
    expect(String(front.description)).not.toContain('\n')
    expect(file.content).toContain('`mcp__opencraw__run`')
  })
})

describe('agentsMdSection and mergeSection', () => {
  const section = agentsMdSection(OPENCRAW_AGENT)

  it('is a section between two markers, with its own heading and no second top-level title', () => {
    expect(section).toMatchObject({ host: 'agents-md', path: 'AGENTS.md', mode: 'section' })
    expect(section.content.startsWith(`${SECTION_BEGIN}\n## The OpenCraw agent`)).toBe(true)
    expect(section.content.trimEnd().endsWith(SECTION_END)).toBe(true)
    expect(section.content).not.toContain('\n# OpenCraw agent')
  })

  it('becomes the whole file when there is none, and is added after what the person wrote', () => {
    expect(mergeSection(undefined, section.content)).toBe(section.content)
    expect(mergeSection('', section.content)).toBe(section.content)
    const merged = mergeSection('# My project\n\nRun the tests.\n', section.content)
    expect(merged.startsWith('# My project\n\nRun the tests.\n\n<!-- opencraw-agent:begin -->')).toBe(true)
  })

  it('replaces only its own section when run again, and a second run changes nothing', () => {
    const once = mergeSection('# My project\n', section.content)
    const edited = once.replace('Casual and warm', 'OLD TEXT')
    const updated = mergeSection(`${edited}\n## After\n\nMine.\n`, section.content)

    expect(updated).not.toContain('OLD TEXT')
    expect(updated).toContain('# My project')
    expect(updated).toContain('## After\n\nMine.')
    expect(mergeSection(updated, section.content)).toBe(updated)
  })
})

describe('renderAgentFiles', () => {
  it('renders one file per host chosen, in the order the hosts are offered', () => {
    expect(renderAgentFiles(OPENCRAW_AGENT, ['agents-md', 'copilot']).map(file => file.host)).toEqual(['copilot', 'agents-md'])
    expect(renderAgentFiles(OPENCRAW_AGENT, [])).toEqual([])
  })

  it('offers each host once', () => {
    expect(AGENT_HOSTS.map(host => host.id)).toEqual(['copilot', 'claude-code', 'agents-md'])
  })
})
