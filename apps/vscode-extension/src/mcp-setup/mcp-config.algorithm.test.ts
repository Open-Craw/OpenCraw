import { MCP_HOSTS, configFor, externalSpec } from './mcp-config.algorithm'

describe('externalSpec', () => {
  it('starts the bundled server with node, carrying the hooks module when there is one', () => {
    expect(externalSpec('/ext/node_modules/@opencraw/mcp/bin/opencraw-mcp.mjs')).toEqual({ command: 'node', args: ['/ext/node_modules/@opencraw/mcp/bin/opencraw-mcp.mjs'], env: {} })
    expect(externalSpec('/s.mjs', '/h/hooks.mjs').env).toEqual({ OPENCRAW_HOOKS: '/h/hooks.mjs' })
  })
})

describe('configFor', () => {
  const spec = externalSpec('/ext/mcp/bin/opencraw-mcp.mjs')

  it('is a claude mcp add command for Claude Code, quoting a path with spaces', () => {
    expect(configFor('claude-code', spec)).toBe('claude mcp add opencraw -- node /ext/mcp/bin/opencraw-mcp.mjs')
    expect(configFor('claude-code', externalSpec(String.raw`C:\Users\Ana Maria\ext\opencraw-mcp.mjs`, '/h/hooks.mjs'))).toBe(String.raw`claude mcp add opencraw --env OPENCRAW_HOOKS=/h/hooks.mjs -- node "C:\Users\Ana Maria\ext\opencraw-mcp.mjs"`)
  })

  it('is the common mcpServers JSON for the other hosts, parseable and with the env only when set', () => {
    const json = JSON.parse(configFor('json', spec)) as { mcpServers: { opencraw: Record<string, unknown> } }
    expect(json.mcpServers.opencraw).toEqual({ command: 'node', args: ['/ext/mcp/bin/opencraw-mcp.mjs'] })
    expect(configFor('cursor', externalSpec('/s.mjs', '/h.mjs'))).toContain('"OPENCRAW_HOOKS": "/h.mjs"')
  })

  it('offers each host once', () => {
    expect(MCP_HOSTS.map(host => host.id)).toEqual(['claude-code', 'cursor', 'json'])
  })
})
