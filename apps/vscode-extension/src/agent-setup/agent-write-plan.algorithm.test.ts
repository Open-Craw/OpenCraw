import { OPENCRAW_AGENT, renderAgentFiles } from '@opencraw/agent'
import { planAgentWrites } from './agent-write-plan.algorithm'

const FILES = renderAgentFiles(OPENCRAW_AGENT, ['copilot', 'agents-md'])

describe('planAgentWrites', () => {
  it('creates what is not there', () => {
    const plan = planAgentWrites(FILES, new Map())

    expect(plan.map(write => [write.path, write.action])).toEqual([['.github/agents/opencraw.agent.md', 'create'], ['AGENTS.md', 'create']])
  })

  it('asks to replace the agent’s own file when it differs, and leaves it alone when it is the same', () => {
    const [agentFile] = FILES
    const edited = planAgentWrites([agentFile], new Map([[agentFile.path, 'my own version']]))
    const same = planAgentWrites([agentFile], new Map([[agentFile.path, agentFile.content]]))

    expect(edited[0].action).toBe('replace')
    expect(same[0].action).toBe('unchanged')
  })

  it('adds the section to an existing AGENTS.md without losing what the person wrote, and a second run changes nothing', () => {
    const section = FILES[1]
    const first = planAgentWrites([section], new Map([['AGENTS.md', '# My project\n\nRun the tests.\n']]))
    expect(first[0].action).toBe('update-section')
    expect(first[0].content.startsWith('# My project\n\nRun the tests.')).toBe(true)

    const second = planAgentWrites([section], new Map([['AGENTS.md', first[0].content]]))
    expect(second[0].action).toBe('unchanged')
  })
})
