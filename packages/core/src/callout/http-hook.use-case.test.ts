import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingHttpHeaders, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { HostNotAllowedError } from '../host-allowlist'
import type { HookContext } from '../hooks'
import { CalloutError } from './callout.error'
import { httpHook } from './http-hook.use-case'

const context: HookContext = { recipeId: 'books', scope: {}, log: () => undefined }

interface Seen { headers: IncomingHttpHeaders, body: string }

let server: Server
let url: string
let seen: Seen
let respond: (reply: (status: number, body: string, delayMs?: number) => void) => void

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
    request.on('end', () => {
      seen = { headers: request.headers, body }
      respond((status, text, delayMs = 0) => {
        setTimeout(() => {
          response.writeHead(status, { 'content-type': 'application/json' })
          response.end(text)
        }, delayMs)
      })
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/slug`
})
afterAll(async () => { await new Promise(resolve => server.close(resolve)) })
beforeEach(() => {
  respond = (reply) => {
    reply(200, JSON.stringify({ status: 'ok', output: 'done' }))
  }
})

describe('httpHook', () => {
  it('posts the request as JSON and returns the output of an ok answer', async () => {
    const hook = httpHook('slug', url)

    expect(await hook('Hello World', { max: 5 }, context)).toBe('done')

    const request = JSON.parse(seen.body) as { kind: string, name: string, input: string, args: unknown, idempotencyKey: string }
    expect(request).toMatchObject({ kind: 'hook', name: 'slug', input: 'Hello World', args: { max: 5 } })
    expect(seen.headers['content-type']).toBe('application/json')
    expect(seen.headers['idempotency-key']).toBe(request.idempotencyKey)
  })

  it('sends a bearer token from the named environment variable, and signs the body with another', async () => {
    process.env.OPENCRAW_TEST_TOKEN = 'token-1'
    process.env.OPENCRAW_TEST_KEY = 'key-1'
    try {
      await httpHook('slug', url, { tokenEnv: 'OPENCRAW_TEST_TOKEN', signingKeyEnv: 'OPENCRAW_TEST_KEY' })('a', {}, context)

      expect(seen.headers.authorization).toBe('Bearer token-1')
      expect(seen.headers['x-opencraw-signature']).toBe(`sha256=${createHmac('sha256', 'key-1').update(seen.body).digest('hex')}`)
    } finally {
      delete process.env.OPENCRAW_TEST_TOKEN
      delete process.env.OPENCRAW_TEST_KEY
    }
  })

  it('names a missing secret by its variable, never by a value', async () => {
    delete process.env.OPENCRAW_TEST_MISSING
    const hook = httpHook('slug', url, { tokenEnv: 'OPENCRAW_TEST_MISSING' })

    await expect(hook('a', {}, context)).rejects.toThrow(/environment variable OPENCRAW_TEST_MISSING is not set/)
  })

  it('throws the reason of an error answer', async () => {
    respond = (reply) => { reply(200, JSON.stringify({ status: 'error', error: 'quota exceeded' })) }

    await expect(httpHook('slug', url)('a', {}, context)).rejects.toThrow(/quota exceeded/)
  })

  it('reports a failing status with the start of the body', async () => {
    respond = (reply) => { reply(503, 'try later') }

    const failure = httpHook('slug', url)('a', {}, context)

    await expect(failure).rejects.toThrow(/HTTP 503: try later/)
    await expect(failure).rejects.toBeInstanceOf(CalloutError)
  })

  it('refuses a body that is not JSON', async () => {
    respond = (reply) => { reply(200, 'hello') }

    await expect(httpHook('slug', url)('a', {}, context)).rejects.toThrow(/the answer is not JSON: hello/)
  })

  it('gives up on a service that does not answer in time', async () => {
    respond = (reply) => { reply(200, JSON.stringify({ status: 'ok' }), 1000) }

    await expect(httpHook('slug', url, { timeoutMs: 100 })('a', {}, context)).rejects.toThrow(/no answer within 100 ms/)
  })

  it('refuses an endpoint outside the allowed hosts when the hook is made', () => {
    expect(() => httpHook('slug', 'https://evil.example/slug', { allowedHosts: ['svc.example.com'] })).toThrow(HostNotAllowedError)
    expect(() => httpHook('slug', 'https://svc.example.com/slug', { allowedHosts: ['svc.example.com'] })).not.toThrow()
  })
})
