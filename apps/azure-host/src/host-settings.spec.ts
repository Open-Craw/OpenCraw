import { HttpRequest } from '@azure/functions'
import { hostOptions } from './host-settings.js'

const shipped = [{ name: 'books-by-category', version: '1', recipes: [] }]
const request = (principal?: string): HttpRequest => new HttpRequest({ method: 'POST', url: 'https://host/api/crawl', headers: principal === undefined ? {} : { 'x-ms-client-principal-name': principal } })

describe('hostOptions', () => {
  it('defaults to the example site, MCP on, recipes in memory without a keyed storage account', async () => {
    const options = hostOptions({}, shipped)
    expect(options.allowedHosts).toEqual(['books.toscrape.com'])
    expect(options.mcp).toBe(true)
    expect(options.identify).toBeUndefined()
    expect(options.results).toBeUndefined()
    await expect(options.recipes?.list()).resolves.toEqual([{ name: 'books-by-category', version: '1', state: 'promoted' }])
    expect(options.pools).toMatchObject({ maxWindows: 4, idleTtlMs: 600_000 })
  })

  it('reads hosts, windows, the idle time and MCP from app settings', () => {
    const options = hostOptions({ OPENCRAW_ALLOWED_HOSTS: 'a.example, *.b.example', OPENCRAW_MAX_WINDOWS: '6', OPENCRAW_POOL_IDLE_MINUTES: '2', OPENCRAW_MCP: 'false' }, shipped)
    expect(options.allowedHosts).toEqual(['a.example', '*.b.example'])
    expect(options.mcp).toBe(false)
    expect(options.pools).toMatchObject({ maxWindows: 6, idleTtlMs: 120_000, windows: { max: 6 } })
  })

  it('trusts the principal header only when App Service authentication is on, and lets only the named promoters promote', () => {
    expect(hostOptions({ OPENCRAW_PROMOTERS: 'lead@example.com' }, shipped).identify).toBeUndefined()
    const options = hostOptions({ WEBSITE_AUTH_ENABLED: 'True', OPENCRAW_PROMOTERS: 'Lead@Example.com' }, shipped)
    expect(options.identify?.(request('agent@example.com'))).toBe('agent@example.com')
    expect(options.canPromote?.('lead@example.com')).toBe(true)
    expect(options.canPromote?.('agent@example.com')).toBe(false)
    expect(options.canPromote?.(undefined)).toBe(false)
  })

  it('keeps recipes and large results in Blob storage when the account has a key, not when the connection is identity-based', () => {
    expect(hostOptions({ AzureWebJobsStorage: 'UseDevelopmentStorage=true' }, shipped).results).toBeDefined()
    expect(hostOptions({ AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;AccountName=x;AccountKey=a2V5;EndpointSuffix=core.windows.net' }, shipped).results).toBeDefined()
    expect(hostOptions({ AzureWebJobsStorage__accountName: 'x' }, shipped).results).toBeUndefined()
  })

  it('reads an access config, and names what is wrong with a bad one', () => {
    const options = hostOptions({ OPENCRAW_ACCESS: '{"profiles":{"residential":{"kind":"proxy","server":"https://proxy.example:8080","username":"{{env.PROXY_USER}}","password":"{{env.PROXY_PASSWORD}}"}},"default":"residential"}' }, shipped)
    expect(options.access?.default).toBe('residential')
    expect(() => hostOptions({ OPENCRAW_ACCESS: '{"profiles":{},"default":"missing"}' }, shipped)).toThrow('OPENCRAW_ACCESS: default: default names a profile that does not exist')
  })
})
