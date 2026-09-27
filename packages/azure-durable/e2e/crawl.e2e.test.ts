import type { Server } from 'node:http'
import { HttpRequest } from '@azure/functions'
import type { OutputRecord } from '@opencraw/core'
import { browserConfig, FIXTURE_BASE, FIXTURE_PORT, startFixtureSite, stopFixtureSite } from '../../core/e2e/fixture-site'
import { memoryRecipes, registerOpenCraw } from '../src/index'
import type { CrawlResult, ResultStore } from '../src/index'
import { inProcessDurable } from './durable-harness'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => {
  await host.close()
  await stopFixtureSite(site)
})

const output = { kind: 'output', id: 'maker', version: 1, fields: { name: { type: 'string', key: true, required: true } } }
const search = (id: string, query: string, base = FIXTURE_BASE): Record<string, unknown> => ({
  kind:    'input',
  id,
  output:  'maker',
  mode:    'api',
  start:   [{ url: `${base}/widgets/makers?search=${query}` }],
  limits:  { retry: { attempts: 1 } },
  steps:   [{ type: 'request', id: 'found', url: '{{ start.url }}', as: 'json' }, { type: 'forEach', over: 'found', as: 'maker', emit: true, steps: [] }],
  mapping: { name: { from: 'maker' } },
})

const saved = new Map<string, OutputRecord[]>()
const results: ResultStore = {
  save: async (name, records) => {
    saved.set(name, [...records])

    return `https://results.test/${name}`
  },
}
const host = registerOpenCraw({
  allowedHosts: caller => (caller === 'blocked' ? undefined : [`127.0.0.1:${FIXTURE_PORT}`]),
  identify:     request => request.headers.get('x-caller') ?? undefined,
  recipes:      memoryRecipes([
    { name: 'makers', version: '1', recipes: [output, search('tata', 'TATA')] },
    { name: 'makers', version: '2', recipes: [output, search('tvs', 'TVS')], state: 'draft' },
  ]),
  results,
  // One maker record fits; the four a MOTOR search finds do not.
  inlineLimitBytes: 600,
  browser:          browserConfig(),
})
const durable = inProcessDurable([host.orchestrations.crawl], { OpenCrawRunRecipe: host.activities.runRecipe })

async function post (body: unknown, headers: Record<string, string> = {}): Promise<{ status: number, body: { id?: string, error?: string, issues?: unknown[] } }> {
  const request = new HttpRequest({ method: 'POST', url: 'http://host/api/crawl', headers: { 'content-type': 'application/json', ...headers }, body: { string: JSON.stringify(body) } })
  const response = await host.http.startCrawl(request, durable.client) as { status?: number, jsonBody?: unknown }

  return { status: response.status ?? 200, body: response.jsonBody as { id?: string } }
}

async function finished (id: string | undefined): Promise<{ runtimeStatus: string, output: CrawlResult, customStatus: unknown }> {
  const instance = durable.instances.get(id ?? '')
  if (instance === undefined) throw new Error(`no instance ${id}`)
  await instance.done

  return { runtimeStatus: instance.runtimeStatus, output: instance.output as CrawlResult, customStatus: instance.customStatus }
}

describe('POST /crawl', () => {
  it('runs inline recipes, one activity each, and returns their reports and records', async () => {
    const started = await post({ output, inputs: [search('tvs', 'TVS'), search('auto', 'AUTO')] })
    expect(started.status).toBe(202)
    const { runtimeStatus, output: result, customStatus } = await finished(started.body.id)
    expect(runtimeStatus).toBe('Completed')
    expect(result.recipes.map(report => [report.recipeId, report.emitted])).toEqual([['tvs', 1], ['auto', 1]])
    expect(result.records.map(record => record.data.name)).toEqual(['TVS MOTOR', 'BAJAJ AUTO'])
    expect(customStatus).toEqual({ recipes: 2, recipesDone: 2, records: 2 })
  })

  it('saves a result too large to return inline, and returns its link', async () => {
    const started = await post({ output, inputs: [search('motor', 'MOTOR')] })
    const { output: result } = await finished(started.body.id)
    expect(result.records).toEqual([])
    expect(result.results).toEqual([`https://results.test/${started.body.id}/0.jsonl`])
    expect(saved.get(`${started.body.id}/0.jsonl`)).toHaveLength(4)
  })

  it('runs a stored recipe set by name, and refuses a draft (409) or a missing version (404)', async () => {
    const named = await post({ recipe: { name: 'makers', version: '1' } })
    const { output: result } = await finished(named.body.id)
    expect(result.recipes[0].recipeId).toBe('tata')
    await expect(post({ recipe: { name: 'makers', version: '2' } })).resolves.toMatchObject({ status: 409 })
    await expect(post({ recipe: { name: 'makers', version: '9' } })).resolves.toMatchObject({ status: 404 })
  })

  it('refuses recipes that do not load before anything is queued, listing the issues', async () => {
    const before = durable.starts.length
    const invalid = await post({ output, inputs: [{ ...search('bad', 'X'), mode: 'teleport' }] })
    expect(invalid.status).toBe(400)
    expect(invalid.body.issues?.length).toBeGreaterThan(0)
    await expect(post({ inputs: [] })).resolves.toMatchObject({ status: 400 })
    expect(durable.starts.length).toBe(before)
  })

  it('keeps recipes to the caller\'s hosts, and refuses a caller with none', async () => {
    const outside = await post({ output, inputs: [search('elsewhere', 'TVS', `http://localhost:${FIXTURE_PORT}`)] })
    const { output: result } = await finished(outside.body.id)
    expect(result.recipes[0].errorKind).toBe('host')
    await expect(post({ output, inputs: [search('tvs', 'TVS')] }, { 'x-caller': 'blocked' })).resolves.toMatchObject({ status: 403 })
  })
})
