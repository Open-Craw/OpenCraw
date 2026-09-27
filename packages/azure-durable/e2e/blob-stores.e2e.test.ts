import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { connect } from 'node:net'
import { join } from 'node:path'
import type { OutputRecord } from '@opencraw/core'
import { blobRecipes, blobResults } from '../src/index'

/** Azurite, the Azure Storage emulator, on its default blob port: what `UseDevelopmentStorage=true` points at. */
const STORAGE = 'UseDevelopmentStorage=true'
let azurite: ChildProcess

beforeAll(async () => {
  azurite = spawn(join(__dirname, '..', '..', '..', 'node_modules', '.bin', 'azurite-blob'), ['--inMemoryPersistence', '--silent', '--skipApiVersionCheck', '--blobHost', '127.0.0.1', '--blobPort', '10000'], { stdio: 'ignore' })
  await listening(10_000, 15_000)
})
afterAll(() => { azurite.kill() })

/** Waits until something accepts connections on the port. */
async function listening (port: number, withinMs: number): Promise<void> {
  const until = Date.now() + withinMs
  for (;;) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.end()
        resolve(true)
      })
      socket.on('error', () => { resolve(false) })
    })
    if (open) return
    if (Date.now() > until) throw new Error(`nothing listens on port ${port}`)
    await new Promise((resolve) => { setTimeout(resolve, 200) })
  }
}

const record = (name: string): OutputRecord => ({ key: name, data: { name }, source: { recipeId: 'makers', url: 'https://example.com', emittedAt: '2026-09-27T00:00:00Z' } })

describe('blobResults', () => {
  it('saves records as JSON Lines and returns a read link that works', async () => {
    const results = blobResults({ connectionString: STORAGE, container: 'results-test' })
    const url = await results.save('instance-1/0.jsonl', [record('TATA'), record('TVS')])
    expect(url).toContain('instance-1/0.jsonl')
    expect(url).toContain('sig=')
    const response = await fetch(url)
    expect(response.headers.get('content-type')).toBe('application/x-ndjson')
    const body = await response.text()
    expect(body.split('\n').map(line => (JSON.parse(line) as OutputRecord).key)).toEqual(['TATA', 'TVS'])
  })
})

describe('blobRecipes', () => {
  const recipes = [{ kind: 'output', id: 'maker' }, { kind: 'input', id: 'makers' }]

  it('serves shipped sets as promoted, stores new versions as drafts, and never rewrites a version', async () => {
    const store = blobRecipes({ connectionString: STORAGE, container: 'recipes-test', shipped: [{ name: 'shipped', version: '1', recipes }] })
    await expect(store.get('shipped', '1')).resolves.toMatchObject({ state: 'promoted', recipes })
    await expect(store.put({ name: 'shipped', version: '1', recipes })).rejects.toMatchObject({ status: 409 })
    await expect(store.get('makers', '1')).resolves.toBeUndefined()
    await store.put({ name: 'makers', version: '1', recipes })
    await expect(store.get('makers', '1')).resolves.toEqual({ name: 'makers', version: '1', recipes, state: 'draft' })
    await expect(store.put({ name: 'makers', version: '1', recipes: [] })).rejects.toMatchObject({ status: 409 })
    await store.promote('makers', '1')
    await expect(store.get('makers', '1')).resolves.toMatchObject({ state: 'promoted' })
    await expect(store.promote('makers', '9')).rejects.toMatchObject({ status: 404 })
    await expect(store.list()).resolves.toEqual([{ name: 'shipped', version: '1', state: 'promoted' }, { name: 'makers', version: '1', state: 'promoted' }])
  })

  it('lets only one of two racing publishes of a version win', async () => {
    const store = blobRecipes({ connectionString: STORAGE, container: 'recipes-race' })
    const results = await Promise.allSettled([store.put({ name: 'race', version: '1', recipes }), store.put({ name: 'race', version: '1', recipes })])
    expect(results.map(result => result.status).sort((a, b) => a.localeCompare(b))).toEqual(['fulfilled', 'rejected'])
  })
})
