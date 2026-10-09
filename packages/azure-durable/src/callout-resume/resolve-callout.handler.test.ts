import type { HttpRequest } from '@azure/functions'
import type { DurableClient } from 'durable-functions'
import type { HostSettings } from '../host-options'
import { calloutEventName } from './callout-event.mapper'
import { signCalloutTicket } from './callout-ticket.algorithm'
import { resolveCallout } from './resolve-callout.handler'

const KEY_ENV = 'OPENCRAW_TEST_CALLOUT_KEY'
const NOW = 1_000_000
const settings = { callouts: { signingKeyEnv: KEY_ENV, waitMs: 60_000 } } as unknown as HostSettings

function requestWith (token: string, body: unknown): HttpRequest {
  return { params: { token }, json: () => Promise.resolve(body) } as unknown as HttpRequest
}

function clientWith (runtimeStatus: string | undefined) {
  const raised: { instanceId: string, name: string, data: unknown }[] = []
  const client = {
    getStatus:  () => Promise.resolve(runtimeStatus === undefined ? undefined : { runtimeStatus }),
    raiseEvent: (instanceId: string, name: string, data: unknown) => {
      raised.push({ instanceId, name, data })

      return Promise.resolve()
    },
  } as unknown as DurableClient

  return { client, raised }
}

async function statusOf (token: string, body: unknown, client: DurableClient, config: HostSettings = settings, now: number = NOW): Promise<number | undefined> {
  const response = await resolveCallout(requestWith(token, body), client, config, now)

  return response.status
}

const token = (overrides: Partial<Parameters<typeof signCalloutTicket>[1]> = {}): string => signCalloutTicket('s3cret', { instanceId: 'job-1', index: 1, key: 'abc', expiresAt: NOW + 1000, ...overrides })

describe('resolveCallout', () => {
  beforeEach(() => { process.env[KEY_ENV] = 's3cret' })
  afterEach(() => { delete process.env[KEY_ENV] })

  it('raises the posted result to the waiting job as the event of that call', async () => {
    const { client, raised } = clientWith('Running')

    expect(await statusOf(token(), { status: 'ok', output: 42 }, client)).toBe(202)
    expect(raised).toEqual([{ instanceId: 'job-1', name: calloutEventName(1, 'abc'), data: { status: 'ok', output: 42 } }])
  })

  it('takes an error result too', async () => {
    const { client, raised } = clientWith('Running')

    await resolveCallout(requestWith(token(), { status: 'error', error: 'declined' }), client, settings, NOW)

    expect(raised[0]?.data).toEqual({ status: 'error', error: 'declined' })
  })

  it('is not there when the host does not take posted-back results', async () => {
    const { client } = clientWith('Running')

    expect(await statusOf(token(), { status: 'ok' }, client, {} as HostSettings)).toBe(404)
  })

  it('refuses a token it did not sign (401) and one that expired (410)', async () => {
    const { client, raised } = clientWith('Running')

    expect(await statusOf('garbage', { status: 'ok' }, client)).toBe(401)
    expect(await statusOf(token({ expiresAt: NOW - 1 }), { status: 'ok' }, client)).toBe(410)
    expect(raised).toEqual([])
  })

  it('refuses a body that is not a result, and a pending one', async () => {
    const { client, raised } = clientWith('Running')

    expect(await statusOf(token(), { nope: true }, client)).toBe(400)
    expect(await statusOf(token(), { status: 'pending' }, client)).toBe(400)
    expect(raised).toEqual([])
  })

  it('refuses a result for a job that is no longer running, so a second post is not a second resume', async () => {
    for (const runtimeStatus of ['Completed', 'Failed', 'Terminated', undefined]) {
      const { client, raised } = clientWith(runtimeStatus)

      expect(await statusOf(token(), { status: 'ok' }, client)).toBe(410)
      expect(raised).toEqual([])
    }
  })
})
