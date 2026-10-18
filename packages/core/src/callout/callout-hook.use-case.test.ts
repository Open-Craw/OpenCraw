import type { HookContext } from '../hooks'
import { CalloutError } from '../callout-protocol'
import type { CalloutRequest, CalloutResponse } from '../callout-protocol'
import type { CalloutTransport } from '../callout-transport'
import { calloutHook } from './callout-hook.use-case'

const context: HookContext = { recipeId: 'books', scope: { price: 5 }, log: () => {} }

/** A transport answering from a list, recording what it was asked: a channel to a client in another language. */
function transportOf (...answers: CalloutResponse[]): CalloutTransport & { requests: CalloutRequest[] } {
  const requests: CalloutRequest[] = []

  return {
    label: 'client hook slug',
    requests,
    call:  async (request) => {
      requests.push(request)

      return answers.shift() ?? { status: 'error', error: 'no more answers' }
    },
  }
}

describe('calloutHook', () => {
  it('sends a hook request through the transport and returns the output', async () => {
    const transport = transportOf({ status: 'ok', output: 'hello-world' })
    const slug = calloutHook('slug', transport)

    await expect(slug('Hello World', { sep: '-' }, context)).resolves.toBe('hello-world')
    expect(transport.requests).toHaveLength(1)
    expect(transport.requests[0]).toMatchObject({ kind: 'hook', name: 'slug', input: 'Hello World', args: { sep: '-' }, context: { recipeId: 'books', scope: { price: 5 } } })
  })

  it('asks again after a pending answer, with the same idempotency key, until it settles', async () => {
    const transport = transportOf({ status: 'pending', retryAfterMs: 1 }, { status: 'pending', retryAfterMs: 1 }, { status: 'ok', output: 3 })

    await expect(calloutHook('slug', transport)('x', {}, context)).resolves.toBe(3)
    expect(transport.requests).toHaveLength(3)
    expect(new Set(transport.requests.map(r => r.idempotencyKey)).size).toBe(1)
  })

  it('fails the step with the handler\'s error', async () => {
    await expect(calloutHook('slug', transportOf({ status: 'error', error: 'bad input' }))('x', {}, context)).rejects.toThrow(CalloutError)
  })
})
