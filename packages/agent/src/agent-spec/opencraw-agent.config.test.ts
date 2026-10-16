import { OPENCRAW_AGENT } from './opencraw-agent.config'

describe('OPENCRAW_AGENT', () => {
  // The instructions wrap their lines: a phrase may be split by a line break.
  const text = OPENCRAW_AGENT.instructions.replaceAll('\n', ' ')

  it('uses exactly the tools the OpenCraw MCP server offers', () => {
    expect(OPENCRAW_AGENT.tools.map(tool => tool.name).sort((a, b) => a.localeCompare(b))).toEqual(['diff', 'docs', 'list_recipes', 'probe', 'run', 'validate'])
    for (const tool of OPENCRAW_AGENT.tools) expect(text).toContain(`\`${tool.name}\``)
  })

  it('has the personality it was asked for: casual, respectful, with humour, honest', () => {
    expect(text).toMatch(/Casual and warm, with a light sense of humour/)
    expect(text).toMatch(/Respectful/)
    expect(text).toMatch(/Honest/)
  })

  it('knows inputs and outputs, hooks, every document type and the output formats, and says where to read the details', () => {
    for (const needle of ['output recipe', 'input recipe', 'hook', 'hooks module', 'PDF', 'spreadsheet', 'Markdown', 'XML', '.xlsx', '.pdf', '`docs`', '“6. Hooks”']) expect(text).toContain(needle)
  })

  it('works from a prompt that says what the input and the expected output are, a file included', () => {
    expect(text).toContain('what the *input* is')
    expect(text).toContain('what the *output* should be')
    expect(text).toContain('the output can even be a file')
  })

  it('knows Studio and says what to do when it can and cannot drive it', () => {
    expect(text).toContain('## Studio')
    expect(text).toContain('studio_open_recipe')
    expect(text).toContain('describe the exact clicks')
  })

  it('keeps its rules: no secrets in recipes, polite to sites, a dry run first, code only with consent', () => {
    for (const needle of ['No secrets in recipes', '{{env.NAME}}', 'Be polite to sites', 'dryRun', 'Run code only with consent']) expect(text).toContain(needle)
  })

  it('names the Studio tools a connected chatbot will offer', () => {
    expect(OPENCRAW_AGENT.studioTools.map(tool => tool.name)).toEqual(['studio_open_recipe', 'studio_pick', 'studio_run_sample'])
  })
})
