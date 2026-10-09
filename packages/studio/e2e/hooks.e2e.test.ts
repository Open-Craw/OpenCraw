import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { WorkspaceView } from '../src/studio-api'

/** A recipe whose mapping calls the hook `double` on each item of a JSON file read through `file:` (no browser, no network). */
function recipesFolder (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-hooks-'))
  const data = join(folder, 'data.json')
  writeFileSync(data, JSON.stringify({ items: [{ n: 2 }, { n: 5 }] }))
  writeFileSync(join(folder, 'number.output.json'), JSON.stringify({ kind: 'output', id: 'number', version: 1, fields: { doubled: { type: 'number', required: true, key: true } } }))
  writeFileSync(join(folder, 'numbers.input.json'), JSON.stringify({
    kind:   'input',
    id:     'numbers',
    output: 'number',
    mode:   'api',
    start:  [{ url: pathToFileURL(data).href }],
    steps:  [
      { type: 'request', id: 'response', url: '{{start.url}}', as: 'json' },
      { type: 'extract', id: 'items', from: 'response', selector: '$.items[*]', kind: 'jsonpath', take: 'json', many: true },
      { type: 'forEach', over: 'items', as: 'item', emit: true, steps: [] },
    ],
    mapping: { doubled: { from: 'item.n', transform: [{ op: 'hook', name: 'double' }] } },
  }))

  return folder
}

async function post<T> (server: StudioServer, body: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${new URL(server.url).port}/api/command`, {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-opencraw-token': server.token },
    body:    JSON.stringify(body),
  })
  if (response.status !== 200) throw new Error(`${response.status}: ${await response.text()}`)

  return response.json() as Promise<T>
}

/** Runs a sample over the event socket; resolves with the records and the run's error, if any. */
async function sample (server: StudioServer): Promise<{ doubled: unknown[], error?: string }> {
  const socket = new WebSocket(`ws://127.0.0.1:${new URL(server.url).port}/ws?token=${server.token}`)
  const doubled: unknown[] = []
  const finished = new Promise<string | undefined>((resolve) => {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { type: string, data?: { doubled?: unknown }, error?: string }
      if (message.type === 'record') doubled.push(message.data?.doubled)
      else if (message.type === 'run-finished') resolve(message.error)
    })
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve)
    socket.addEventListener('error', reject)
  })
  await post(server, { type: 'run-sample', recipeId: 'numbers' })
  try {
    return { doubled, error: await finished }
  } finally {
    socket.close()
  }
}

describe('studio started with hooks (issue #150)', () => {
  let server: StudioServer | undefined
  afterEach(async () => { await server?.close() })

  it('runs a recipe that calls a hook, and tells the UI which hooks are loaded', async () => {
    const folder = recipesFolder()
    server = await startStudioServer({ initialFolder: folder, plugins: { source: 'hooks.mjs', hooks: { double: input => Number(input) * 2 } } })

    const workspace = await post<WorkspaceView>(server, { type: 'open-workspace', folder })
    expect(workspace.hooks).toEqual({ source: 'hooks.mjs', names: ['double'] })

    const result = await sample(server)
    expect(result.error).toBeUndefined()
    expect(result.doubled.sort((a, b) => Number(a) - Number(b))).toEqual([4, 10])
  }, 30000)

  it('without hooks, the failure says how to start Studio with them, and nothing is advertised', async () => {
    const folder = recipesFolder()
    server = await startStudioServer({ initialFolder: folder })

    const workspace = await post<WorkspaceView>(server, { type: 'open-workspace', folder })
    expect(workspace.hooks).toBeUndefined()

    const result = await sample(server)
    expect(result.error).toMatch(/opencraw studio --hooks <file>/)
  }, 30000)

  it('with hooks that lack the name, the failure lists the ones it has', async () => {
    const folder = recipesFolder()
    server = await startStudioServer({ initialFolder: folder, plugins: { source: 'hooks.mjs', hooks: { triple: input => Number(input) * 3 } } })

    const result = await sample(server)
    expect(result.error).toMatch(/not one of the hooks in hooks\.mjs: triple/)
  }, 30000)
})
