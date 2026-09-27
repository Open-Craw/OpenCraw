import type { Server } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import type { RecipeReport } from '../src/index'
import { browserConfig, FIXTURE_BASE, FIXTURE_PORT, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

/** The same server under a name the list leaves out. */
const OTHER = `http://localhost:${FIXTURE_PORT}`
const output = { kind: 'output', id: 'row', version: 1, fields: { value: { type: 'string' }, own: { type: 'string' }, other: { type: 'string' }, socket: { type: 'string' } } }

async function crawl (mode: 'web' | 'api', start: string, steps: unknown[], mapping?: Record<string, unknown>): Promise<{ report: RecipeReport, records: Record<string, unknown>[] }> {
  const sink = memorySink()
  const crawler = createCrawler({ browser: browserConfig(), sink, allowedHosts: [`127.0.0.1:${FIXTURE_PORT}`] })
  try {
    const input = { kind: 'input', id: 'allow', output: 'row', mode, start: [{ url: start }], limits: { timeoutMs: 5000, retry: { attempts: 1 } }, steps, mapping: mapping ?? { value: { from: 'found.value' } } }
    const result = await crawler.run(await loadRecipes([output, input]))

    return { report: result.recipes[0], records: sink.records.map(({ data }) => data) }
  } finally {
    await crawler.close()
  }
}

const fetchJson = [{ type: 'request', id: 'found', url: '{{ start.url }}', as: 'json' }, { type: 'emit' }]

describe('allowedHosts', () => {
  it('lets api requests reach an allowed host, redirects within it included', async () => {
    const direct = await crawl('api', `${FIXTURE_BASE}/allow/data`, fetchJson)
    expect(direct.records.map(({ value }) => value)).toEqual(['ok'])
    const redirected = await crawl('api', `${FIXTURE_BASE}/allow/redirect?to=/allow/data`, fetchJson)
    expect(redirected.records.map(({ value }) => value)).toEqual(['ok'])
  }, 30_000)

  it('refuses an api request to another host, a redirect that leads there, and file:', async () => {
    const other = await crawl('api', `${OTHER}/allow/data`, fetchJson)
    expect(other.report.errorKind).toBe('host')
    expect(other.report.error).toContain(`${OTHER}/allow/data is outside the allowed hosts (127.0.0.1:${FIXTURE_PORT})`)
    const redirected = await crawl('api', `${FIXTURE_BASE}/allow/redirect?to=${encodeURIComponent(`${OTHER}/allow/data`)}`, fetchJson)
    expect(redirected.report.errorKind).toBe('host')
    expect(redirected.report.error).toContain(`${OTHER}/allow/data is outside the allowed hosts`)
    const file = await crawl('api', 'file:///etc/hostname', [{ type: 'request', id: 'found', url: '{{ start.url }}', as: 'text' }, { type: 'emit' }], { value: { from: 'found' } })
    expect(file.report.errorKind).toBe('host')
    // A relative file: URL resolves first, then is refused like any other.
    const relative = await crawl('api', 'file:package.json', [{ type: 'request', id: 'found', url: '{{ start.url }}', as: 'text' }, { type: 'emit' }], { value: { from: 'found' } })
    expect(relative.report.errorKind).toBe('host')
    const resolved = pathToFileURL(join(process.cwd(), 'package.json')).href
    expect(relative.report.error).toContain(`${resolved} is outside the allowed hosts`)
  }, 30_000)

  it('in a browser, lets the page reach its own host but not another one, by fetch or web socket', async () => {
    const { report, records } = await crawl('web', `${FIXTURE_BASE}/allow/page`, [
      { type: 'goto', url: '{{ start.url }}' },
      { type: 'wait', selector: '#done' },
      { type: 'extract', id: 'own', selector: '#own', kind: 'css' },
      { type: 'extract', id: 'other', selector: '#other', kind: 'css' },
      { type: 'extract', id: 'socket', selector: '#socket', kind: 'css' },
      { type: 'emit' },
    ], { own: { from: 'own' }, other: { from: 'other' }, socket: { from: 'socket' } })
    expect(report.error).toBeUndefined()
    // The web socket was closed by the guard (1008), not left to fail on its own (1006).
    expect(records).toMatchObject([{ own: 'ok', other: 'blocked', socket: '1008' }])
  }, 30_000)

  it('in a browser, refuses a navigation to another host, a request step there, and file:', async () => {
    const goto = await crawl('web', `${OTHER}/allow/data`, [{ type: 'goto', url: '{{ start.url }}' }, { type: 'emit' }], { value: { from: 'page.url' } })
    expect(goto.report.errorKind).toBe('host')
    const request = await crawl('web', `${FIXTURE_BASE}/allow/page`, [{ type: 'goto', url: '{{ start.url }}' }, { type: 'request', id: 'found', url: `${OTHER}/allow/data`, as: 'json' }, { type: 'emit' }])
    expect(request.report.errorKind).toBe('host')
    expect(request.report.error).toContain('is outside the allowed hosts')
    const file = await crawl('web', 'file:///etc/hostname', [{ type: 'goto', url: '{{ start.url }}' }, { type: 'emit' }], { value: { from: 'page.url' } })
    expect(file.report.errorKind).toBe('host')
  }, 30_000)
})
