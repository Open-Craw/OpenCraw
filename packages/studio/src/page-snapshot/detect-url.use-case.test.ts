import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { detectJsonUrl } from './detect-url.use-case'

const ROUTES: Record<string, { type: string, body: string }> = {
  '/json':        { type: 'application/json', body: '{"a":1}' },
  '/plain-json':  { type: 'text/plain; charset=utf-8', body: '{"result":"ok","data":{"list":[1,2]}}' },
  '/plain-array': { type: 'text/plain', body: ' [1, 2, 3]' },
  '/page':        { type: 'text/html', body: '<html><body>{"not":"json"}</body></html>' },
  '/words':       { type: 'text/plain', body: 'hello {world}' },
  '/broken':      { type: 'text/plain', body: '{"cut off":' },
}

let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((request, response) => {
    const route = ROUTES[request.url ?? '']
    if (route === undefined) {
      response.writeHead(404).end()

      return
    }
    response.writeHead(200, { 'content-type': route.type }).end(route.body)
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const { port } = server.address() as AddressInfo
  base = `http://127.0.0.1:${String(port)}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => { resolve() })
  })
})

describe('detectJsonUrl', () => {
  it('knows JSON by its content type, and by its body when the API serves it as text', async () => {
    expect(await detectJsonUrl(`${base}/json`)).toBe(true)
    expect(await detectJsonUrl(`${base}/plain-json`)).toBe(true)
    expect(await detectJsonUrl(`${base}/plain-array`)).toBe(true)
  })

  it('leaves a page, plain words and a body that is cut off as not JSON', async () => {
    expect(await detectJsonUrl(`${base}/page`)).toBe(false)
    expect(await detectJsonUrl(`${base}/words`)).toBe(false)
    expect(await detectJsonUrl(`${base}/broken`)).toBe(false)
  })

  it('is not JSON for an address that cannot be reached', async () => {
    expect(await detectJsonUrl(`${base}/missing`)).toBe(false)
    expect(await detectJsonUrl('http://127.0.0.1:1/nothing')).toBe(false)
  })
})
