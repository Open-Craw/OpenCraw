// Replays every conformance transcript (packages/driver/conformance/*.json) against the driver, as a
// client in another language would: the suite every client must pass, held to the driver itself first.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { serveDriver } from './serve-driver.use-case'

interface Transcript { name: string, steps: ({ send: unknown } | { receive: unknown })[] }

const folder = join(import.meta.dirname, '..', '..', 'conformance')
const transcripts = readdirSync(folder).filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(join(folder, file), 'utf8')) as Transcript)

/** `expected`'s fields, each in `actual`; "<any>" matches anything present. */
function contains (actual: unknown, expected: unknown, at = '$'): void {
  if (expected === '<any>') {
    expect(actual, at).not.toBeUndefined()

    return
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${at} is an array`).toBe(true)
    expect((actual as unknown[]).length, `${at}.length`).toBe(expected.length)
    for (const [i, item] of expected.entries()) { contains((actual as unknown[])[i], item, `${at}[${i}]`) }

    return
  }
  if (expected !== null && typeof expected === 'object') {
    expect(actual !== null && typeof actual === 'object', `${at} is an object`).toBe(true)
    for (const [key, value] of Object.entries(expected)) contains((actual as Record<string, unknown>)[key], value, `${at}.${key}`)

    return
  }
  expect(actual, at).toEqual(expected)
}

async function replay (transcript: Transcript): Promise<void> {
  const toDriver = new PassThrough()
  const fromDriver = new PassThrough()
  const received: unknown[] = []
  let buffered = ''
  fromDriver.on('data', (chunk: Buffer) => {
    buffered += chunk.toString()
    const parts = buffered.split('\n')
    buffered = parts.pop() ?? ''
    for (const part of parts) received.push(JSON.parse(part))
  })
  const done = serveDriver(toDriver, fromDriver, { driverVersion: '0.0.0-conformance' })
  const next = async (): Promise<unknown> => {
    for (let i = 0; i < 500 && received.length === 0; i++) await new Promise(resolve => setTimeout(resolve, 10))
    if (received.length === 0) throw new Error(`${transcript.name}: the driver sent nothing`)

    return received.shift()
  }
  for (const [index, step] of transcript.steps.entries()) {
    if ('send' in step) toDriver.write(`${JSON.stringify(step.send)}\n`)
    else contains(await next(), step.receive, `${transcript.name} step ${index}`)
  }
  toDriver.end()
  await done
}

describe('driver conformance', () => {
  it('has transcripts to replay', () => {
    expect(transcripts.map(t => t.name).sort((a, b) => a.localeCompare(b))).toEqual(['errors', 'handshake', 'validate'])
  })

  for (const transcript of transcripts) {
    it(`passes ${transcript.name}`, async () => { await replay(transcript) })
  }
})
