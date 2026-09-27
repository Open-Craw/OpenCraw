import type { Server } from 'node:http'
import { HttpRequest } from '@azure/functions'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { browserConfig, FIXTURE_BASE, FIXTURE_PORT, startFixtureSite, stopFixtureSite } from '../../core/e2e/fixture-site'
import { memoryRecipes, registerOpenCraw } from '../src/index'
import type { ItemOutcome } from '../src/index'
import { inProcessDurable } from './durable-harness'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => {
  await host.close()
  await stopFixtureSite(site)
})

const output = { kind: 'output', id: 'maker', version: 1, fields: { name: { type: 'string', key: true, required: true } } }
const search = (query: string, base = FIXTURE_BASE): Record<string, unknown> => ({
  kind:    'input',
  id:      'makers',
  output:  'maker',
  mode:    'api',
  vars:    { q: query },
  start:   [{ url: `${base}/widgets/makers` }],
  limits:  { retry: { attempts: 1 } },
  steps:   [{ type: 'request', id: 'found', url: '{{ start.url }}?search={{ vars.q }}', as: 'json' }, { type: 'forEach', over: 'found', as: 'maker', emit: true, steps: [] }],
  mapping: { name: { from: 'maker' } },
})

const host = registerOpenCraw({
  allowedHosts: caller => (caller === 'blocked' ? undefined : [`127.0.0.1:${FIXTURE_PORT}`]),
  identify:     request => request.headers.get('x-caller') ?? undefined,
  canPromote:   caller => caller === 'lead',
  recipes:      memoryRecipes([{ name: 'shipped', version: '1', recipes: [output, search('TVS')] }]),
  mcp:          { sampleRecords: 2, sampleMs: 20_000 },
  browser:      browserConfig(),
})
const durable = inProcessDurable([host.orchestrations.crawl, host.orchestrations.item], { OpenCrawRunRecipe: host.activities.runRecipe, OpenCrawRunItem: host.activities.runItem })

/** An MCP client whose HTTP calls go straight to the host's `/mcp` handler, as `caller`. */
async function connect (caller: string): Promise<Client> {
  const client = new Client({ name: 'e2e', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL('http://host/api/mcp'), {
    fetch: async (url, init = {}) => {
      const headers = { ...Object.fromEntries(new Headers(init.headers)), 'x-caller': caller }
      const request = new HttpRequest({ method: init.method ?? 'GET', url: String(url), headers, ...(typeof init.body === 'string' && { body: { string: init.body } }) })
      const response = await host.http.mcp(request, durable.client)

      return new Response(response.body as string | undefined, { status: response.status, headers: response.headers as Record<string, string> })
    },
  })
  await client.connect(transport)

  return client
}

interface ToolAnswer { isError?: boolean, structuredContent?: Record<string, unknown>, content: { text: string }[] }
async function call (client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolAnswer> {
  return await client.callTool({ name, arguments: args }) as unknown as ToolAnswer
}

async function submit (crawlId: string, body: unknown): Promise<{ status: number, id?: string }> {
  const request = new HttpRequest({ method: 'POST', url: `http://host/api/jobs/${crawlId}/items`, params: { crawlId }, headers: { 'content-type': 'application/json' }, body: { string: JSON.stringify(body) } })
  const response = await host.http.submitItem(request, durable.client) as { status?: number, jsonBody?: { id?: string } }

  return { status: response.status ?? 200, ...response.jsonBody }
}

async function promote (name: string, version: string, caller: string): Promise<number> {
  const response = await host.http.promote(new HttpRequest({ method: 'POST', url: `http://host/api/recipes/${name}/${version}/promote`, params: { name, version }, headers: { 'x-caller': caller } }))

  return response.status ?? 200
}

describe('/mcp', () => {
  it('lists the authoring tools, none of which takes a path', async () => {
    const client = await connect('agent')
    const { tools } = await client.listTools()
    expect(tools.map(tool => tool.name).sort((a, b) => a.localeCompare(b))).toEqual(['get_recipes', 'list_recipes', 'probe', 'publish', 'run', 'status', 'validate'])
    expect(tools.every(tool => Object.keys(tool.inputSchema.properties ?? {}).every(key => !/path|out|dir/i.test(key)))).toBe(true)
    await client.close()
  })

  it('probes from the host, but only the caller\'s hosts', async () => {
    const client = await connect('agent')
    const found = await call(client, 'probe', { url: `${FIXTURE_BASE}/widgets/makers?search=TATA` })
    expect(found.isError).toBeUndefined()
    expect(found.structuredContent?.json).toBeDefined()
    const outside = await call(client, 'probe', { url: `http://localhost:${FIXTURE_PORT}/widgets/makers?search=TATA` })
    expect(outside.isError).toBe(true)
    expect(outside.content[0].text).toContain('is outside the allowed hosts')
    const file = await call(client, 'probe', { url: '/etc/hostname' })
    expect(file.isError).toBe(true)
    await client.close()
  })

  it('validates inline recipes, and runs a sample of a few records', async () => {
    const client = await connect('agent')
    const invalid = await call(client, 'validate', { recipes: [output, { ...search('X'), mode: 'teleport' }] })
    expect(invalid.structuredContent).toMatchObject({ ok: false })
    const sample = await call(client, 'run', { recipes: [output, search('MOTOR')] })
    expect((sample.structuredContent?.records as unknown[]).length).toBe(2)
    await client.close()
  })

  it('runs everything in the background, and shows the run only to the caller who started it', async () => {
    const client = await connect('agent')
    const started = await call(client, 'run', { recipes: [output, search('MOTOR')], full: true })
    const instanceId = String(started.structuredContent?.instanceId)
    await durable.instances.get(instanceId)?.done
    const finished = await call(client, 'status', { instanceId })
    expect(finished.structuredContent).toMatchObject({ runtimeStatus: 'Completed' })
    expect((finished.structuredContent?.output as { records: unknown[] }).records).toHaveLength(4)
    const stranger = await connect('someone-else')
    await expect(call(stranger, 'status', { instanceId })).resolves.toMatchObject({ isError: true })
    await client.close()
    await stranger.close()
  })

  it('publishes a draft production refuses until a person promotes it', async () => {
    const client = await connect('agent')
    const published = await call(client, 'publish', { name: 'makers', version: '1', recipes: [output, search('AUTO')] })
    expect(published.structuredContent).toMatchObject({ state: 'draft' })
    await expect(call(client, 'publish', { name: 'makers', version: '1', recipes: [output, search('AUTO')] })).resolves.toMatchObject({ isError: true })
    await expect(call(client, 'publish', { name: 'makers', version: '2', recipes: [output, { ...search('X'), mode: 'teleport' }] })).resolves.toMatchObject({ isError: true })
    const listed = await call(client, 'list_recipes')
    expect(listed.structuredContent?.recipes).toEqual([{ name: 'shipped', version: '1', state: 'promoted' }, { name: 'makers', version: '1', state: 'draft' }])
    const item = { recipe: { name: 'makers', version: '1' }, item: { id: 'auto', vars: { q: 'AUTO' } } }
    await expect(submit('drafts', item)).resolves.toMatchObject({ status: 409 })
    expect(await promote('makers', '1', 'agent')).toBe(403)
    expect(await promote('makers', '1', 'lead')).toBe(200)
    const accepted = await submit('drafts', item)
    expect(accepted.status).toBe(202)
    await durable.instances.get(accepted.id ?? '')?.done
    expect((durable.instances.get(accepted.id ?? '')?.output as ItemOutcome).records?.map(record => record.data.name)).toEqual(['BAJAJ AUTO'])
    await client.close()
  })

  it('refuses a caller with no hosts', async () => {
    await expect(connect('blocked')).rejects.toThrow()
  })
})
