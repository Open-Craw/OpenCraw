import { resolveHostOptions } from './host-options.config'

describe('resolveHostOptions', () => {
  it('fills the defaults: function keys, 256 KiB inline, pools, no MCP, nobody promotes', () => {
    const settings = resolveHostOptions({ allowedHosts: ['example.com'], routePrefix: '/opencraw/' })
    expect(settings).toMatchObject({ authLevel: 'function', inlineLimitBytes: 262_144, routePrefix: 'opencraw', pools: { maxWindows: 8, idleTtlMs: 600_000 } })
    expect(settings.mcp).toBeUndefined()
    expect(settings.canPromote('anyone')).toBe(false)
    expect(resolveHostOptions({ allowedHosts: ['*'], mcp: true }).mcp).toEqual({ sampleRecords: 20, sampleMs: 60_000 })
  })

  it('refuses an empty host list, and an MCP endpoint nobody has to log in to', () => {
    expect(() => resolveHostOptions({ allowedHosts: [] })).toThrow('allowedHosts is empty')
    expect(() => resolveHostOptions({ allowedHosts: ['*'], mcp: true, authLevel: 'anonymous' })).toThrow('the MCP endpoint needs authentication')
    expect(resolveHostOptions({ allowedHosts: ['*'], mcp: true, authLevel: 'anonymous', identify: () => 'someone' }).mcp).toBeDefined()
  })
})
