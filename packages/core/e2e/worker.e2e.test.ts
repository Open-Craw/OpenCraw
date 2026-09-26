import { execSync } from 'node:child_process'
import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink, workFrom } from '../src/index'
import type { CrawlEvent, RecipeReport, WorkItem, WorkOptions, WorkSource } from '../src/index'
import { browserConfig, FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'
import { workerSite } from './worker-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })
beforeEach(() => { workerSite.loads = 0 })

const output = { kind: 'output', id: 'row', version: 1, fields: { row: { type: 'string', key: true, required: true } } }

/** The report as a worker recipe: settings and filters kept on the window, Apply and the rows every item. */
const report = {
  kind:   'input',
  id:     'report',
  output: 'row',
  mode:   'web',
  vars:   { state: 'DL', rto: 'DL1', group: '' },
  start:  [{ url: `${FIXTURE_BASE}/worker/report` }],
  window: { check: '#axis' },
  limits: { timeoutMs: 5000, retry: { attempts: 1 } },
  steps:  [
    { type: 'goto', url: '{{start.url}}', keep: true },
    { type: 'select', selector: '#axis', value: 'maker', keep: true },
    { type: 'select', selector: '#state', values: ['{{ vars.state }}'], force: true, keep: true },
    { type: 'select', selector: '#rto', values: ['{{ vars.rto }}'], force: true, keep: true, timeoutMs: 3000 },
    { type: 'select', selector: '#group', values: ['{{ split(vars.group) }}'], force: true, clear: true, keep: true },
    { type: 'click', selector: '#apply' },
    { type: 'wait', selector: '#result .row', timeoutMs: 1500 },
    { type: 'extract', id: 'rows', selector: '#result .row', kind: 'css', many: true },
    { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] },
  ],
  mapping: { row: { from: 'row' } },
}

function item (state: string, rto: string, group = ''): WorkItem {
  return { id: `${state}-${rto}-${group || 'all'}`, vars: { state, rto, group } }
}

async function work (items: WorkItem[] | WorkSource, options: WorkOptions): Promise<{ events: CrawlEvent[], rows: string[], sources: (string | undefined)[], result: Awaited<ReturnType<ReturnType<typeof createCrawler>['work']>> }> {
  const events: CrawlEvent[] = []
  const sink = memorySink()
  const crawler = createCrawler({ browser: browserConfig(), sink, onEvent: (event) => { events.push(event) } })
  try {
    const result = await crawler.work(await loadRecipes([output, report]), Array.isArray(items) ? workFrom(items) : items, options)

    return { events, result, rows: sink.records.map(({ data }) => String(data.row)).sort((a, b) => a.localeCompare(b)), sources: sink.records.map(({ source }) => source.item) }
  } finally {
    await crawler.close()
  }
}

const ofType = <T extends CrawlEvent['type']>(events: CrawlEvent[], type: T): Extract<CrawlEvent, { type: T }>[] => events.filter((event): event is Extract<CrawlEvent, { type: T }> => event.type === type)

describe('worker mode', () => {
  it('keeps each window busy on its page: settings and unchanged filters kept, a blank filter cleared', async () => {
    const items = [item('DL', 'DL1', 'Bus'), item('DL', 'DL2', 'Bus'), item('DL', 'DL2'), item('GA', 'GA1', 'Car'), item('GA', 'GA1', 'Bus'), item('DL', 'DL1', 'Car')]
    const { events, rows, sources, result } = await work(items, { windows: 2 })
    expect(result.items).toEqual({ success: 6, failure: 0, neutral: 0 })
    expect(rows).toEqual(['maker|DL|DL1|Bus', 'maker|DL|DL1|Car', 'maker|DL|DL2|all', 'maker|DL|DL2|Bus', 'maker|GA|GA1|Bus', 'maker|GA|GA1|Car'])
    expect(new Set(sources)).toEqual(new Set(items.map(entry => entry.id)))
    // Two windows, two page loads: every later item reused its page.
    expect(ofType(events, 'window:open')).toHaveLength(2)
    expect(workerSite.loads).toBe(2)
    const kept = ofType(events, 'step:kept')
    expect(kept.filter(event => event.path === 'steps.0')).toHaveLength(4)
    expect(kept.filter(event => event.path === 'steps.1')).toHaveLength(4)
    expect(new Set(ofType(events, 'item:finish').map(event => event.window))).toEqual(new Set([1, 2]))
  }, 60_000)

  it('gives a failed item\'s window a fresh start and never touches the others: one bad item, one failure', async () => {
    const good = [item('DL', 'DL1'), item('DL', 'DL2'), item('GA', 'GA1'), item('DL', 'DL1', 'Bus'), item('DL', 'DL2', 'Car'), item('GA', 'GA1', 'Car')]
    const { events, result, rows } = await work([good[0], item('DL', 'BAD'), ...good.slice(1)], { windows: 3 })
    expect(result.items).toEqual({ success: 6, failure: 1, neutral: 0 })
    expect(rows).toHaveLength(6)
    expect(ofType(events, 'window:close').filter(event => event.reason === 'fresh')).toHaveLength(1)
    // Every page load is a window opening: no window reloaded its page between items.
    expect(workerSite.loads).toBe(ofType(events, 'window:open').length)
  }, 60_000)

  it('grows after successes and shrinks on a failure without closing a busy window', async () => {
    const goods = (count: number, state: string, rtos: string[]): WorkItem[] => Array.from({ length: count }, (_, index) => item(state, rtos[index % rtos.length], index % 2 === 0 ? 'Bus' : 'Car'))
    const { events, result } = await work([...goods(6, 'DL', ['DL1', 'DL2']), item('GA', 'BAD'), ...goods(16, 'GA', ['GA1'])], { windows: { min: 1, max: 3, grow: { after: 2 } } })
    const changes = ofType(events, 'windows:change').map(event => [event.from, event.to])
    expect(changes.slice(0, 2)).toEqual([[1, 2], [2, 3]])
    expect(changes.some(([from, to]) => to < from)).toBe(true)
    // Only the bad item failed: the windows the shrink sent away finished their items first.
    expect(result.items).toEqual({ success: 22, failure: 1, neutral: 0 })
    expect(result.windows.peak).toBe(3)
    expect(ofType(events, 'window:close').some(event => event.reason === 'retire')).toBe(true)
  }, 90_000)

  it('leaves the pool as it is for a neutral outcome, and tells the source', async () => {
    const outcomes: string[] = []
    const queue = [item('DL', 'BAD'), item('DL', 'DL1'), item('DL', 'BAD'), item('DL', 'DL2')]
    const source: WorkSource = { next: async () => queue.shift(), failed: (_item, _report, outcome) => { outcomes.push(outcome) } }
    const { events, result } = await work(source, { windows: { min: 1, max: 4, start: 2 }, classify: (run: RecipeReport) => (run.error === undefined ? 'success' : 'neutral') })
    expect(result.items).toEqual({ success: 2, failure: 0, neutral: 2 })
    expect(outcomes).toEqual(['neutral', 'neutral'])
    expect(ofType(events, 'windows:change')).toHaveLength(0)
  }, 60_000)

  it('restarts the browser after failures in a row, once no item runs, and goes on', async () => {
    const { events, result, rows } = await work([item('DL', 'BAD'), item('GA', 'BAD'), item('DL', 'DL1'), item('GA', 'GA1')], { windows: { min: 1, restart: { after: 2 } } })
    expect(ofType(events, 'browser:restart')).toHaveLength(1)
    expect(result.restarts).toBe(1)
    expect(result.items).toEqual({ success: 2, failure: 2, neutral: 0 })
    expect(rows).toEqual(['maker|DL|DL1|all', 'maker|GA|GA1|all'])
  }, 60_000)

  it('survives a browser that dies between items: the next window launches a new one', async () => {
    const queue = [item('DL', 'DL1'), item('DL', 'DL2'), item('GA', 'GA1'), item('DL', 'DL1', 'Bus')]
    let taken = 0
    const source: WorkSource = {
      next: async () => {
        taken += 1
        if (taken === 3) killBrowsers()

        return queue.shift()
      },
      failed: (failedItem, _report, outcome) => { if (outcome === 'neutral') queue.push(failedItem) },
    }
    const { result, rows } = await work(source, { windows: 1 })
    expect(result.items.success).toBe(4)
    expect(rows).toHaveLength(4)
  }, 60_000)

  it('runs api recipes the same way, one HTTP session per window', async () => {
    const makers = {
      kind:    'input',
      id:      'makers',
      output:  'row',
      mode:    'api',
      vars:    { q: '' },
      start:   [{ url: `${FIXTURE_BASE}/widgets/makers` }],
      steps:   [{ type: 'request', id: 'found', url: '{{ start.url }}?search={{ vars.q }}', as: 'json' }, { type: 'forEach', over: 'found', as: 'row', emit: true, steps: [] }],
      mapping: { row: { from: 'row' } },
    }
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const result = await crawler.work(await loadRecipes([output, makers]), workFrom(['TATA', 'AUTO', 'TVS'].map(q => ({ id: q, vars: { q } }))), { windows: 2 })
      expect(result.items.success).toBe(3)
      expect(sink.records.map(({ data }) => String(data.row)).sort((a, b) => a.localeCompare(b))).toEqual(['BAJAJ AUTO', 'TATA MOTORS LTD', 'TATA MOTORS PASSENGER VEHICLES LTD', 'TVS MOTOR'])
    } finally {
      await crawler.close()
    }
  }, 30_000)
})

/** Kills the browsers this test process launched, as a crash would. */
function killBrowsers (): void {
  const lines = execSync('ps -eo pid=,ppid=,comm=').toString().split('\n')
  for (const line of lines) {
    const [pid, ppid, command] = line.trim().split(/\s+/, 3)
    if (Number(ppid) === process.pid && /chrom/i.test(command ?? '')) process.kill(Number(pid), 'SIGKILL')
  }
}
