import type { Server } from 'node:http'
import { HttpRequest } from '@azure/functions'
import { browserConfig, FIXTURE_BASE, FIXTURE_PORT, startFixtureSite, stopFixtureSite } from '../../core/e2e/fixture-site'
import { workerSite } from '../../core/e2e/worker-site'
import { memoryRecipes, registerOpenCraw } from '../src/index'
import type { ItemOutcome, PoolState } from '../src/index'
import { inProcessDurable } from './durable-harness'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => {
  await host.close()
  await stopFixtureSite(site)
})
beforeEach(() => { workerSite.loads = 0 })

const output = { kind: 'output', id: 'row', version: 1, fields: { row: { type: 'string', key: true, required: true } } }
/** Core's worker report: settings kept on the window, Apply and the rows each item. */
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

const host = registerOpenCraw({
  allowedHosts: [`127.0.0.1:${FIXTURE_PORT}`],
  recipes:      memoryRecipes([{ name: 'report', version: '1', recipes: [output, report] }, { name: 'report', version: '2', recipes: [output, report] }]),
  browser:      browserConfig(),
  pools:        { idleTtlMs: 1500, windows: { min: 1, max: 3, grow: { after: 2 }, idle: { afterMs: 1000 } }, maxWindows: 3 },
})
const durable = inProcessDurable([host.orchestrations.item], { OpenCrawRunItem: host.activities.runItem })

const combos: [string, string, string][] = [['DL', 'DL1', ''], ['DL', 'DL2', 'Bus'], ['GA', 'GA1', 'Car'], ['DL', 'DL1', 'Car']]
const itemBody = (index: number, version = '1'): Record<string, unknown> => {
  const [state, rto, group] = combos[index % combos.length]

  return { recipe: { name: 'report', version }, item: { id: `item-${index}`, vars: { state, rto, group } } }
}

async function submit (crawlId: string, body: unknown): Promise<{ status: number, id?: string, error?: string }> {
  const request = new HttpRequest({ method: 'POST', url: `http://host/api/jobs/${crawlId}/items`, params: { crawlId }, headers: { 'content-type': 'application/json' }, body: { string: JSON.stringify(body) } })
  const response = await host.http.submitItem(request, durable.client) as { status?: number, jsonBody?: { id?: string, error?: string } }

  return { status: response.status ?? 200, ...response.jsonBody }
}

async function outcome (id: string | undefined): Promise<ItemOutcome> {
  const instance = durable.instances.get(id ?? '')
  if (instance === undefined) throw new Error(`no instance ${id}`)
  await instance.done

  return instance.output as ItemOutcome
}

async function job (crawlId: string, method: 'GET' | 'DELETE' = 'GET'): Promise<{ status: number, body: PoolState }> {
  const response = await host.http.job(new HttpRequest({ method, url: `http://host/api/jobs/${crawlId}`, params: { crawlId } }))

  return { status: response.status ?? 200, body: response.jsonBody as PoolState }
}

describe('pooled items', () => {
  it('runs items sent one at a time on one warm window: one page load for twenty items, each with its own row', async () => {
    const rows: unknown[] = []
    for (let index = 0; index < 20; index += 1) {
      const started = await submit('serial', itemBody(index))
      expect(started.status).toBe(202)
      const result = await outcome(started.id)
      expect(result.outcome).toBe('success')
      rows.push(...(result.records ?? []).map(record => record.data.row))
    }
    expect(rows).toHaveLength(20)
    expect(rows[2]).toBe('maker|GA|GA1|Car')
    expect(workerSite.loads).toBe(1)
    const { body } = await job('serial')
    expect(body.ended).toEqual({ success: 20, failure: 0, neutral: 0 })
  }, 120_000)

  it('grows the pool when the caller keeps several items in flight', async () => {
    const started = await Promise.all(Array.from({ length: 12 }, async (_, index) => await submit('burst', itemBody(index))))
    const results = await Promise.all(started.map(async entry => await outcome(entry.id)))
    expect(results.every(result => result.outcome === 'success')).toBe(true)
    expect(Math.max(...results.map(result => result.pool?.windows ?? 0))).toBeGreaterThan(1)
  }, 120_000)

  it('runs an item sent twice while it runs once, and refuses another recipe version for the same crawl', async () => {
    const first = await submit('dupes', itemBody(0))
    const again = await submit('dupes', itemBody(0))
    expect(again.id).toBe(first.id)
    expect(durable.starts.filter(id => id === first.id)).toHaveLength(1)
    await expect(outcome(first.id)).resolves.toMatchObject({ outcome: 'success' })
    const other = await submit('dupes', itemBody(1, '2'))
    expect(other.status).toBe(409)
    expect(other.error).toContain('runs recipes "report" version "1"')
  }, 60_000)

  it('closes a pool on request, and on its own once idle for idleTtlMs', async () => {
    const closing = await submit('closing', itemBody(0))
    await outcome(closing.id)
    await expect(job('closing')).resolves.toMatchObject({ status: 200 })
    await expect(job('closing', 'DELETE')).resolves.toMatchObject({ status: 202 })
    await host.pools.close('\u{0}closing')
    await expect(job('closing')).resolves.toMatchObject({ status: 404 })
    const idle = await submit('idle', itemBody(1))
    await outcome(idle.id)
    await expect(job('idle')).resolves.toMatchObject({ status: 200 })
    await new Promise((resolve) => { setTimeout(resolve, 4000) })
    await expect(job('idle')).resolves.toMatchObject({ status: 404 })
  }, 60_000)

  it('refuses a bad crawl id or body, and an unknown recipe version', async () => {
    await expect(submit('a b', itemBody(0))).resolves.toMatchObject({ status: 400 })
    await expect(submit('ok', { item: { id: 'x', vars: {} } })).resolves.toMatchObject({ status: 400 })
    await expect(submit('ok', itemBody(0, '7'))).resolves.toMatchObject({ status: 404 })
  })
})
