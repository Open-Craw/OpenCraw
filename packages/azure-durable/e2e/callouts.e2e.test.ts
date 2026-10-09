import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { HttpRequest } from '@azure/functions'
import { httpHook } from '@opencraw/core'
import { registerOpenCraw } from '../src/index'
import type { CrawlResult, OpenCrawHost } from '../src/index'
import { inProcessDurable } from './durable-harness'

const KEY_ENV = 'OPENCRAW_E2E_CALLOUT_KEY'

interface Post { callback: { url: string }, idempotencyKey: string, args: unknown }

let server: Server
let base: string
let host: OpenCrawHost
let durable: ReturnType<typeof inProcessDurable>
const posts: Post[] = []

beforeAll(async () => {
  process.env[KEY_ENV] = 'e2e-signing-key'
  server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' })
      if (request.method === 'POST') {
        posts.push(JSON.parse(body) as Post)
        response.end(JSON.stringify({ status: 'pending', retryAfterMs: 50 }))
      } else {
        response.end(JSON.stringify(['alpha']))
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  base = `http://127.0.0.1:${String(port)}`
  host = registerOpenCraw({
    allowedHosts: [`127.0.0.1:${String(port)}`],
    hooks:        { price: httpHook('price', `${base}/price`) },
    callouts:     { signingKeyEnv: KEY_ENV, waitMs: 2000 },
  })
  durable = inProcessDurable([host.orchestrations.crawl], { OpenCrawRunRecipe: host.activities.runRecipe })
})
afterAll(async () => {
  await host.close()
  await new Promise(resolve => server.close(resolve))
  delete process.env[KEY_ENV]
})
beforeEach(() => { posts.length = 0 })

const output = { kind: 'output', id: 'priced', version: 1, fields: { name: { type: 'string', key: true, required: true }, price: { type: 'string' } } }
const input = (): Record<string, unknown> => ({
  kind:   'input',
  id:     'priced-items',
  output: 'priced',
  mode:   'api',
  start:  [{ url: `${base}/items` }],
  limits: { retry: { attempts: 1 } },
  steps:  [
    { type: 'request', id: 'found', url: '{{ start.url }}', as: 'json' },
    { type: 'hook', id: 'price', name: 'price', args: { sku: 'alpha' } },
    { type: 'forEach', over: 'found', as: 'item', emit: true, steps: [] },
  ],
  mapping: { name: { from: 'item' }, price: { from: 'price' } },
})

async function start (): Promise<string> {
  const request = new HttpRequest({ method: 'POST', url: 'http://host/api/crawl', headers: { 'content-type': 'application/json' }, body: { string: JSON.stringify({ output, inputs: [input()] }) } })
  const response = await host.http.startCrawl(request, durable.client) as { jsonBody?: { id: string } }

  return (response.jsonBody as { id: string }).id
}

async function until (condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 8000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

async function finished (id: string): Promise<{ runtimeStatus: string, output: CrawlResult }> {
  const instance = durable.instances.get(id)
  if (instance === undefined) throw new Error(`no instance ${id}`)
  await instance.done

  return { runtimeStatus: instance.runtimeStatus, output: instance.output as CrawlResult }
}

function postBack (callbackUrl: string, body: unknown): Promise<{ status?: number }> {
  const token = new URL(callbackUrl).pathname.split('/', 4)[3] as string
  const request = new HttpRequest({ method: 'POST', url: callbackUrl, params: { token }, headers: { 'content-type': 'application/json' }, body: { string: JSON.stringify(body) } })

  return host.http.resolveCallout(request, durable.client)
}

describe('a hook that answers pending and posts its result back', () => {
  it('parks the recipe, takes the posted result, and runs the recipe again with it', async () => {
    const id = await start()
    await until(() => posts.length === 1, 'the service to be called')

    const post = posts[0] as Post
    expect(post.callback.url).toMatch(/^http:\/\/host\/api\/callouts\/[\w-]+\.[\w-]+\/resolve$/)
    const accepted = await postBack(post.callback.url, { status: 'ok', output: 'paid-9' })
    expect(accepted.status).toBe(202)
    const { runtimeStatus, output: result } = await finished(id)

    expect(runtimeStatus).toBe('Completed')
    expect(result.recipes[0]).toMatchObject({ recipeId: 'priced-items', emitted: 1 })
    expect(result.records).toMatchObject([{ data: { name: 'alpha', price: 'paid-9' } }])
    // The resumed run found the result and did not ask the service again.
    expect(posts).toHaveLength(1)
  })

  it('fails the recipe, with the handler named, when nothing is posted back in time', async () => {
    const id = await start()
    const { runtimeStatus, output: result } = await finished(id)

    expect(runtimeStatus).toBe('Completed')
    expect(result.recipes[0]?.error).toMatch(/no result was posted back within 2000 ms by POST http:\/\/127\.0\.0\.1:\d+\/price/)
    expect(result.records).toEqual([])
  })

  it('turns an error posted back into the failure of the step', async () => {
    const id = await start()
    await until(() => posts.length === 1, 'the service to be called')

    await postBack((posts[0] as Post).callback.url, { status: 'error', error: 'card declined' })
    const { output: result } = await finished(id)

    expect(result.recipes[0]?.error).toMatch(/card declined/)
  })
})
