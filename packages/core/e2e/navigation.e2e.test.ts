import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import type { CrawlEvent, RecipeReport } from '../src/index'
import { browserConfig, FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = { kind: 'output', id: 'item', version: 1, fields: { name: { type: 'string', key: true, required: true } } }

type Visit = Extract<CrawlEvent, { type: 'page:visit' }>

interface Crawled {
  report: RecipeReport
  names:  unknown[]
  events: CrawlEvent[]
  visits: Visit[]
}

async function crawl (input: Record<string, unknown>): Promise<Crawled> {
  const sink = memorySink()
  const events: CrawlEvent[] = []
  const crawler = createCrawler({ browser: browserConfig(), sink, onEvent: (event) => { events.push(event) } })
  try {
    const report = await crawler.run(await loadRecipes([output, { kind: 'input', id: 'nav', output: 'item', mode: 'web', mapping: { name: { from: 'name' } }, ...input }]))

    return { report: report.recipes[0], names: sink.records.map(({ data }) => data.name), events, visits: events.filter((event): event is Visit => event.type === 'page:visit') }
  } finally {
    await crawler.close()
  }
}

/** Emits every `.item` of the page. */
const EMIT_ITEMS = [
  { type: 'extract', id: 'items', selector: '.item', kind: 'css', take: 'text', many: true },
  { type: 'forEach', over: 'items', as: 'name', emit: true, steps: [] },
]

function paginated (start: string, next: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { start: [{ url: `${FIXTURE_BASE}${start}` }], steps: [{ type: 'goto', url: '{{start.url}}' }, { type: 'paginate', next, maxPages: 5, steps: EMIT_ITEMS }], ...extra }
}

/** A web recipe that only fetches `url` with a `request`, without retries. */
function requestOnly (url: string): Record<string, unknown> {
  return { start: [{ url: `${FIXTURE_BASE}${url}` }], limits: { retry: { attempts: 1 } }, steps: [{ type: 'request', id: 'name', url: '{{start.url}}', as: 'html' }] }
}

const ALL_ITEMS = ['Item 1-1', 'Item 1-2', 'Item 2-1', 'Item 2-2', 'Item 3-1', 'Item 3-2']

describe('the navigation a step causes (real chromium)', () => {
  it('retries a pagination click whose page fails in passing, and reports each page with its status', async () => {
    const { report, names, events, visits } = await crawl(paginated('/nav/listing?key=retry&fail=1&mode=status', { selector: 'a.next' }, { limits: { retry: { backoffMs: 50 } } }))
    expect(report.error).toBeUndefined()
    expect(names).toEqual(ALL_ITEMS)
    expect(events.filter(event => event.type === 'request:retry').map(event => (event.type === 'request:retry' ? [event.reason, new URL(event.url).searchParams.get('page')] : []))).toEqual([['HTTP 503', '2']])
    expect(visits.map(visit => [visit.number, new URL(visit.url).searchParams.get('page'), visit.status])).toEqual([[1, null, 200], [2, '2', 200], [3, '3', 200]])
    expect(report.pages).toBe(3)
  }, 60000)

  it('fails a pagination click whose page never loads with the real cause, never on the browser error page', async () => {
    const { report, names, visits } = await crawl(paginated('/nav/listing?key=down&fail=99&mode=reset', { selector: 'a.next' }, { limits: { retry: { attempts: 2, backoffMs: 50 } } }))
    expect(report.error).toMatch(/net::ERR_\w+ at http:\/\/127\.0\.0\.1:\d+\/nav\/listing\?key=down/)
    expect(report.error).not.toMatch(/no match/)
    expect(names).toEqual(['Item 1-1', 'Item 1-2'])
    expect(visits.some(visit => visit.url.startsWith('chrome-error:'))).toBe(false)
    expect(report.pages).toBe(1)
  }, 60000)

  it('pages through a next that swaps the content in place, without a navigation', async () => {
    const { report, names, visits } = await crawl(paginated('/nav/client', { selector: 'button.next' }))
    expect(report.error).toBeUndefined()
    expect(names).toEqual(ALL_ITEMS)
    expect(visits.map(visit => [visit.number, new URL(visit.url).pathname, visit.status])).toEqual([[1, '/nav/client', 200], [2, '/nav/client', undefined], [3, '/nav/client', undefined]])
  }, 60000)

  it('counts the pages a click, a key press and a pick navigate to, and not a click that stays', async () => {
    const one = { type: 'set', id: 'name', value: 'x' }
    const emit = { type: 'emit' }
    const clicked = await crawl({ start: [{ url: `${FIXTURE_BASE}/captcha/start` }], steps: [{ type: 'goto', url: '{{start.url}}' }, { type: 'click', selector: '#go' }, one, emit] })
    expect(clicked.visits.map(visit => [new URL(visit.url).pathname, visit.status])).toEqual([['/captcha/start', 200], ['/captcha/gate', 200]])
    expect(clicked.report.pages).toBe(2)
    const pressed = await crawl({
      start: [{ url: `${FIXTURE_BASE}/login` }],
      steps: [
        { type: 'goto', url: '{{start.url}}' },
        { type: 'fill', selector: '#user', value: 'demo' },
        { type: 'fill', selector: '#pass', value: 'demo' },
        { type: 'press', selector: '#pass', key: 'Enter' },
        { type: 'wait', selector: '#logged-in' },
        one,
        emit,
      ],
    })
    expect(pressed.report.error).toBeUndefined()
    expect(pressed.visits.map(visit => [new URL(visit.url).pathname, visit.status])).toEqual([['/login', 200], ['/account', 200]])
    const picked = await crawl({ start: [{ url: `${FIXTURE_BASE}/nav/jump` }], steps: [{ type: 'goto', url: '{{start.url}}' }, { type: 'select', selector: '#jump', value: '/nav/listing?page=3' }, ...EMIT_ITEMS] })
    expect(picked.report.error).toBeUndefined()
    expect(picked.names).toEqual(['Item 3-1', 'Item 3-2'])
    expect(picked.visits.map(visit => [`${new URL(visit.url).pathname}${new URL(visit.url).search}`, visit.status])).toEqual([['/nav/jump', 200], ['/nav/listing?page=3', 200]])
    const stayed = await crawl({ start: [{ url: `${FIXTURE_BASE}/nav/client` }], steps: [{ type: 'goto', url: '{{start.url}}' }, { type: 'click', selector: 'button.next' }, ...EMIT_ITEMS] })
    expect(stayed.names).toEqual(['Item 2-1', 'Item 2-2'])
    expect(stayed.report.pages).toBe(1)
  }, 60000)

  it('stops scrolling a feed that never stops growing at maxScrolls, without failing', async () => {
    const started = Date.now()
    const { report, events } = await crawl({
      start: [{ url: `${FIXTURE_BASE}/nav/endless` }],
      steps: [{ type: 'goto', url: '{{start.url}}' }, { type: 'scroll', to: 'bottom', untilStable: true, maxScrolls: 5, settleMs: 50 }, { type: 'evaluate', id: 'count', script: "document.querySelectorAll('.item').length" }, { type: 'set', id: 'name', value: '{{count}}' }, { type: 'emit' }],
    })
    expect(report.error).toBeUndefined()
    expect(report.emitted).toBe(1)
    expect(events.filter(event => event.type === 'warning').map(event => (event.type === 'warning' ? event.message : ''))).toEqual([expect.stringContaining('maxScrolls (5)')])
    expect(Date.now() - started).toBeLessThan(20000)
  }, 60000)

  it('counts a request that got an answer, even a 404, and not one that got none', async () => {
    const missing = await crawl(requestOnly('/nowhere'))
    expect(missing.report.error).toMatch(/HTTP 404/)
    expect(missing.report.pages).toBe(1)
    const dropped = await crawl(requestOnly('/flaky?key=nav-dropped&fail=9&mode=reset'))
    expect(dropped.report.error).toBeDefined()
    expect(dropped.report.pages).toBe(0)
  }, 60000)
})
