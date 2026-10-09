import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { CalloutRequest, CalloutResponse } from '../callout-protocol'
import type { CalloutTransport } from '../callout-transport'
import { accessCalloutInputSchema } from './access-callout.contract'
import { AccessBroker } from './access-broker.use-case'
import { accessPluginVia, httpAccessPlugin } from './remote-access-plugin.use-case'

function transportAnswering (...answers: CalloutResponse[]) {
  const seen: CalloutRequest[] = []
  const transport: CalloutTransport = {
    label: 'fake lease service',
    call:  (request) => {
      seen.push(request)

      return Promise.resolve(answers[Math.min(seen.length, answers.length) - 1])
    },
  }

  return { transport, seen }
}

const leaseRequest = { recipeId: 'shop', profile: 'residential', country: 'it', attempt: 1, options: { plan: 'gold' } }

describe('accessPluginVia', () => {
  it('asks for an access callout with the profile, the country and the rendered options, in the published shape', async () => {
    const { transport, seen } = transportAnswering({ status: 'ok', output: { proxy: { server: 'http://p:8080' } } })

    await accessPluginVia('svc', transport).lease(leaseRequest)

    expect(seen[0]).toMatchObject({ kind: 'access', name: 'svc', context: { recipeId: 'shop' } })
    expect(accessCalloutInputSchema.parse(seen[0]?.input)).toMatchObject({ phase: 'lease', request: { profile: 'residential', country: 'it', attempt: 1, options: { plan: 'gold' } } })
  })

  it('returns the proxy, the session and the rest of the lease the service answers with', async () => {
    const { transport } = transportAnswering({ status: 'ok', output: { proxy: { server: 'http://p:8080', username: 'u', password: 'pw' }, session: 's-1', headers: { 'x-a': 'b' }, ignoreHTTPSErrors: true, blockResources: ['image'] } })

    const lease = await accessPluginVia('svc', transport).lease(leaseRequest)

    expect(lease).toEqual({ proxy: { server: 'http://p:8080', username: 'u', password: 'pw' }, session: 's-1', headers: { 'x-a': 'b' }, ignoreHTTPSErrors: true, blockResources: ['image'] })
  })

  it('returns a remote browser as a cdp lease', async () => {
    const { transport } = transportAnswering({ status: 'ok', output: { cdp: { endpoint: 'wss://browser.example/session/1', headers: { authorization: 'Bearer t' } } } })

    const lease = await accessPluginVia('svc', transport).lease(leaseRequest)

    expect(lease.cdp).toEqual({ endpoint: 'wss://browser.example/session/1', headers: { authorization: 'Bearer t' } })
  })

  it('gives a lease back by calling the handler with the release phase, when it asked to be', async () => {
    const { transport, seen } = transportAnswering({ status: 'ok', output: { proxy: { server: 'http://p:8080' }, session: 's-1', release: true } }, { status: 'ok' })

    const lease = await accessPluginVia('svc', transport).lease(leaseRequest)
    await lease.release?.()

    expect(seen).toHaveLength(2)
    expect(seen[1]?.input).toEqual({ phase: 'release', profile: 'residential', session: 's-1' })
  })

  it('has no release for a lease that did not ask for one, and ignores a release that fails', async () => {
    const plain = transportAnswering({ status: 'ok', output: { proxy: { server: 'http://p:8080' } } })
    const plainLease = await accessPluginVia('svc', plain.transport).lease(leaseRequest)
    expect(plainLease.release).toBeUndefined()

    const failing = transportAnswering({ status: 'ok', output: { release: true } }, { status: 'error', error: 'gone' })
    const lease = await accessPluginVia('svc', failing.transport).lease(leaseRequest)

    await expect(lease.release?.()).resolves.toBeUndefined()
  })

  it('makes every lease a new action: the nonce differs, so do the idempotency keys', async () => {
    const { transport, seen } = transportAnswering({ status: 'ok', output: {} })
    const plugin = accessPluginVia('svc', transport)

    await plugin.lease(leaseRequest)
    await plugin.lease(leaseRequest)

    expect(seen[0]?.idempotencyKey).not.toBe(seen[1]?.idempotencyKey)
  })

  it('polls a pending lease with the same request until the service answers', async () => {
    const { transport, seen } = transportAnswering({ status: 'pending', retryAfterMs: 5 }, { status: 'ok', output: { proxy: { server: 'http://p:8080' } } })

    const lease = await accessPluginVia('svc', transport).lease(leaseRequest)

    expect(lease.proxy?.server).toBe('http://p:8080')
    expect(seen).toHaveLength(2)
    expect(seen[1]?.idempotencyKey).toBe(seen[0]?.idempotencyKey)
  })

  it('throws the service\'s reason, and refuses an answer that is not a lease', async () => {
    const refused = transportAnswering({ status: 'error', error: 'no capacity' })
    await expect(accessPluginVia('svc', refused.transport).lease(leaseRequest)).rejects.toThrow('fake lease service: no capacity')

    const wrong = transportAnswering({ status: 'ok', output: { proxy: 'http://p:8080' } })
    await expect(accessPluginVia('svc', wrong.transport).lease(leaseRequest)).rejects.toThrow(/not an access lease/)
  })
})

describe('httpAccessPlugin through the access broker', () => {
  let server: Server
  let url: string
  const requests: CalloutRequest[] = []
  beforeAll(async () => {
    server = createServer((request, response) => {
      let body = ''
      request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
      request.on('end', () => {
        requests.push(JSON.parse(body) as CalloutRequest)
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ status: 'ok', output: { proxy: { server: 'http://leased:9000' }, session: 'abc' } }))
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/lease`
  })
  afterAll(async () => { await new Promise(resolve => server.close(resolve)) })

  it('serves a `plugin` profile: the broker renders the options, the service leases the proxy', async () => {
    process.env.OPENCRAW_TEST_PLAN = 'gold'
    try {
      const broker = new AccessBroker({ profiles: { remote: { kind: 'plugin', name: 'leaser', options: { plan: '{{env.OPENCRAW_TEST_PLAN}}' } } }, default: 'remote' }, [httpAccessPlugin('leaser', url)])

      const lease = await broker.lease({ recipeId: 'shop', country: 'de' })

      expect(lease).toMatchObject({ profile: 'remote', kind: 'plugin:leaser', proxy: { server: 'http://leased:9000' }, session: 'abc' })
      expect(requests[0]?.input).toMatchObject({ phase: 'lease', request: { profile: 'remote', country: 'de', options: { plan: 'gold' } } })
    } finally {
      delete process.env.OPENCRAW_TEST_PLAN
    }
  })
})
