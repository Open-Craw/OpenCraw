import { once } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { RPC_ERRORS, RpcFailure } from './json-rpc.contract'
import { openLineChannel } from './line-channel.client'

/** A channel and the other end of its two streams: what a client writes, and every line it reads. */
function channelUnderTest (handle: Parameters<typeof openLineChannel>[2] = async () => null) {
  const toChannel = new PassThrough()
  const fromChannel = new PassThrough()
  const lines: unknown[] = []
  let buffered = ''
  fromChannel.on('data', (chunk: Buffer) => {
    buffered += chunk.toString()
    const parts = buffered.split('\n')
    buffered = parts.pop() ?? ''
    for (const part of parts) lines.push(JSON.parse(part))
  })
  const channel = openLineChannel(toChannel, fromChannel, handle)
  const send = (message: unknown): void => { toChannel.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`) }
  const next = async (): Promise<unknown> => {
    for (let i = 0; i < 200 && lines.length === 0; i++) await new Promise(resolve => setTimeout(resolve, 5))

    return lines.shift()
  }

  return { channel, send, next, end: () => { toChannel.end() } }
}

describe('openLineChannel', () => {
  it('answers a request with its handler\'s result, and a notification with nothing', async () => {
    const calls: string[] = []
    const { send, next } = channelUnderTest(async (method, params) => {
      calls.push(method)

      return { echo: params }
    })
    send({ jsonrpc: '2.0', method: 'note', params: 1 })
    send({ jsonrpc: '2.0', id: 7, method: 'echo', params: { a: 1 } })
    await expect(next()).resolves.toEqual({ jsonrpc: '2.0', id: 7, result: { echo: { a: 1 } } })
    expect(calls).toEqual(['note', 'echo'])
  })

  it('answers a failing handler with its code, or the server code', async () => {
    const { send, next } = channelUnderTest(async (method) => {
      if (method === 'missing') throw new RpcFailure(RPC_ERRORS.methodNotFound, 'no such method')
      throw new Error('it broke')
    })
    send({ jsonrpc: '2.0', id: 1, method: 'missing' })
    await expect(next()).resolves.toMatchObject({ id: 1, error: { code: RPC_ERRORS.methodNotFound, message: 'no such method' } })
    send({ jsonrpc: '2.0', id: 2, method: 'boom' })
    await expect(next()).resolves.toMatchObject({ id: 2, error: { code: RPC_ERRORS.server, message: 'it broke' } })
  })

  it('reports a line that is not JSON or not JSON-RPC, and keeps going', async () => {
    const { send, next } = channelUnderTest(async () => 'ok')
    send('{not json')
    await expect(next()).resolves.toMatchObject({ id: null, error: { code: RPC_ERRORS.parse } })
    send({ id: 3, method: 'x' })
    await expect(next()).resolves.toMatchObject({ id: 3, error: { code: RPC_ERRORS.invalidRequest } })
    send({ jsonrpc: '2.0', id: 4, method: 'x' })
    await expect(next()).resolves.toEqual({ jsonrpc: '2.0', id: 4, result: 'ok' })
  })

  it('sends requests of its own and settles them from the other side\'s responses', async () => {
    const { channel, send, next } = channelUnderTest()
    const answered = channel.request('callout', { q: 1 })
    const failed = channel.request('callout', { q: 2 })
    const first = await next() as { id: number, method: string }
    const second = await next() as { id: number }
    expect(first).toMatchObject({ jsonrpc: '2.0', method: 'callout', params: { q: 1 } })
    send({ jsonrpc: '2.0', id: second.id, error: { code: -32_000, message: 'no' } })
    send({ jsonrpc: '2.0', id: first.id, result: 42 })
    await expect(answered).resolves.toBe(42)
    await expect(failed).rejects.toThrow('no')
  })

  it('rejects what is still waiting when the other side closes', async () => {
    const { channel, end, next } = channelUnderTest()
    const waiting = channel.request('callout', {})
    await next()
    end()
    await expect(waiting).rejects.toThrow('closed')
    await expect(channel.closed).resolves.toBeUndefined()
  })

  it('drains: a request read before the input closed is still answered', async () => {
    const gate = new EventTarget()
    const { channel, send, next, end } = channelUnderTest(async () => {
      await once(gate, 'open')

      return 'late'
    })
    send({ jsonrpc: '2.0', id: 9, method: 'validate' })
    end()
    await channel.closed
    const drained = channel.drained()
    gate.dispatchEvent(new Event('open'))
    await drained
    await expect(next()).resolves.toEqual({ jsonrpc: '2.0', id: 9, result: 'late' })
  })
})
