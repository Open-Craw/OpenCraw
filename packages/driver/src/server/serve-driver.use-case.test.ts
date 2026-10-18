import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { PassThrough } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from '../protocol'
import { RPC_ERRORS } from '../transport'
import { serveDriver } from './serve-driver.use-case'

interface Message { jsonrpc: '2.0', id?: number | null, method?: string, params?: Record<string, unknown>, result?: unknown, error?: { code: number, message: string } }

/**
 * A client for the driver, as any language would write one: it sends requests, answers the driver's
 * `callout` requests with `answerHook`, and collects every notification.
 */
function client (answerHook: (request: { name: string, input: unknown }) => unknown = () => null) {
  const toDriver = new PassThrough()
  const fromDriver = new PassThrough()
  const notifications: Message[] = []
  const waiting = new Map<number, (message: Message) => void>()
  let nextId = 1
  let buffered = ''
  fromDriver.on('data', (chunk: Buffer) => {
    buffered += chunk.toString()
    const parts = buffered.split('\n')
    buffered = parts.pop() ?? ''
    for (const part of parts) {
      const message = JSON.parse(part) as Message
      if (message.method === 'callout') {
        const request = (message.params as { request: { name: string, input: unknown } }).request
        toDriver.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { status: 'ok', output: answerHook(request) } })}\n`)
      } else if (message.method === undefined) {
        waiting.get(message.id as number)?.(message)
      } else {
        notifications.push(message)
      }
    }
  })
  const done = serveDriver(toDriver, fromDriver, { driverVersion: '9.9.9' })
  const call = async (method: string, params?: unknown): Promise<Message> => await new Promise((resolve) => {
    const id = nextId++
    waiting.set(id, resolve)
    toDriver.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
  const finished = async (runId: string): Promise<Message> => {
    for (let i = 0; i < 1000; i++) {
      const found = notifications.find(n => n.method === 'finished' && n.params?.runId === runId)
      if (found !== undefined) return found
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error(`${runId} never finished`)
  }

  const close = async (): Promise<void> => {
    toDriver.end()
    await done
  }

  return { call, notifications, finished, close }
}

const hello = { clientName: 'test', clientVersion: '1.0.0', protocolVersion: PROTOCOL_VERSION }

let base = ''
const site = createServer((request, response) => {
  const page = Number(new URL(request.url ?? '/', 'http://x').searchParams.get('page') ?? 1)
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ items: [{ name: `item ${page}a` }, { name: `item ${page}b` }], next: page < 2 ? `${base}/list?page=${page + 1}` : null }))
})
beforeAll(async () => {
  await new Promise<void>((resolve) => { site.listen(0, '127.0.0.1', resolve) })
  base = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
})
afterAll(async () => { await new Promise(resolve => site.close(resolve)) })

function recipes (hook = true) {
  return [
    { kind: 'output', id: 'thing', version: 1, fields: { name: { type: 'string', required: true, key: true }, shout: { type: 'string' } } },
    {
      kind:   'input',
      id:     'things',
      output: 'thing',
      mode:   'api',
      start:  [{ url: `${base}/list?page=1` }],
      steps:  [{
        type:     'paginate',
        next:     { jsonpath: '$.next' },
        maxPages: 2,
        steps:    [
          { type: 'request', id: 'list', url: '{{page.url}}', as: 'json' },
          { type: 'extract', id: 'items', from: 'list', selector: '$.items[*]', kind: 'jsonpath', take: 'json', many: true },
          { type: 'forEach', over: 'items', as: 'item', emit: true, steps: [] },
        ],
      }],
      mapping: { name: { from: 'item.name' }, ...(hook && { shout: { from: 'item.name', transform: [{ op: 'hook', name: 'shout' }] } }) },
    },
  ]
}

describe('serveDriver', () => {
  it('initializes, refusing another protocol major and every method before it', async () => {
    const driver = client()
    try {
      await expect(driver.call('validate', { recipes: recipes() })).resolves.toMatchObject({ error: { code: RPC_ERRORS.server, message: 'call initialize first' } })
      await expect(driver.call('initialize', { ...hello, protocolVersion: '2.0.0' })).resolves.toMatchObject({ error: { message: expect.stringContaining('protocol 1.x') } })
      await expect(driver.call('initialize', hello)).resolves.toMatchObject({ result: { driverVersion: '9.9.9', protocolVersion: PROTOCOL_VERSION, methods: ['initialize', 'validate', 'run', 'cancel', 'shutdown'] } })
      await expect(driver.call('nope')).resolves.toMatchObject({ error: { code: RPC_ERRORS.methodNotFound } })
      await expect(driver.call('run', { recipes: recipes(), parallel: 99 })).resolves.toMatchObject({ error: { code: RPC_ERRORS.invalidParams, message: expect.stringContaining('parallel') } })
    } finally {
      await driver.close()
    }
  })

  it('validates recipes, naming the hooks a run needs, and every problem with its path', async () => {
    const driver = client()
    try {
      await driver.call('initialize', hello)
      await expect(driver.call('validate', { recipes: recipes() })).resolves.toMatchObject({ result: { ok: true, inputs: ['things'], hooks: ['shout'], issues: [] } })
      await expect(driver.call('validate', { recipes: recipes(false) })).resolves.toMatchObject({ result: { ok: true, hooks: [] } })
      const broken = recipes()
      ;(broken[1] as { mode: string }).mode = 'sideways'
      const answer = await driver.call('validate', { recipes: broken }) as { result: { ok: boolean, issues: { path: string }[] } }
      expect(answer.result.ok).toBe(false)
      expect(answer.result.issues.some(issue => issue.path.includes('mode'))).toBe(true)
    } finally {
      await driver.close()
    }
  })

  it('runs recipes, streaming events and records, asking the client for its hooks, then the report', async () => {
    const asked: unknown[] = []
    const driver = client((request) => {
      asked.push(request.input)

      return String(request.input).toUpperCase()
    })
    try {
      await driver.call('initialize', hello)
      const started = await driver.call('run', { recipes: recipes(), hooks: ['shout'] }) as { result: { runId: string } }
      const { runId } = started.result
      const finished = await driver.finished(runId)
      const report = finished.params?.report as { records: number, recipes: { error?: string }[] }
      expect(finished.params?.error).toBeUndefined()
      expect(report.records).toBe(4)
      expect(report.recipes[0].error).toBeUndefined()
      const records = driver.notifications.filter(n => n.method === 'record' && n.params?.runId === runId).map(n => n.params?.data)
      expect(records).toEqual([
        { name: 'item 1a', shout: 'ITEM 1A' }, { name: 'item 1b', shout: 'ITEM 1B' },
        { name: 'item 2a', shout: 'ITEM 2A' }, { name: 'item 2b', shout: 'ITEM 2B' },
      ])
      expect(asked).toEqual(['item 1a', 'item 1b', 'item 2a', 'item 2b'])
      const events = driver.notifications.filter(n => n.method === 'event').map(n => (n.params?.event as { type: string }).type)
      expect(events[0]).toBe('recipe:start')
      expect(events).toContain('record:emit')
      expect(events.at(-1)).toBe('recipe:finish')
      await expect(driver.call('cancel', { runId })).resolves.toMatchObject({ result: { cancelled: false } })
    } finally {
      await driver.close()
    }
  })

  it('fails a run whose recipes call a hook the client does not serve, before it starts', async () => {
    const driver = client()
    try {
      await driver.call('initialize', hello)
      const started = await driver.call('run', { recipes: recipes() }) as { result: { runId: string } }
      const finished = await driver.finished(started.result.runId)
      const failed = finished.params?.error ?? JSON.stringify(finished.params?.report)
      expect(failed).toContain('shout')
    } finally {
      await driver.close()
    }
  })

  it('stops when the client asks for shutdown', async () => {
    const driver = client()
    await driver.call('initialize', hello)
    await expect(driver.call('shutdown')).resolves.toMatchObject({ result: {} })
    await driver.close()
  })
})
