import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startStudioServer } from './studio-http.use-case'
import type { StudioServer } from './studio-http.use-case'

function emptyUiRoot (): string {
  return mkdtempSync(join(tmpdir(), 'opencraw-ui-none-'))
}

function workspace (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-http-'))
  writeFileSync(join(folder, 'item.output.json'), JSON.stringify({ kind: 'output', id: 'item', version: 1, fields: { name: { type: 'string', required: true, key: true } } }))
  // A fixture data file the recipe fetches, kept outside the workspace folder so open-workspace does not list it.
  const dataFolder = mkdtempSync(join(tmpdir(), 'opencraw-http-data-'))
  const dataFile = join(dataFolder, 'data.json')
  writeFileSync(dataFile, JSON.stringify({ items: [{ name: 'a1' }, { name: 'a2' }] }))
  writeFileSync(join(folder, 'items.input.json'), JSON.stringify({
    kind:   'input',
    id:     'items',
    output: 'item',
    mode:   'api',
    start:  [{ url: `file://${dataFile}` }],
    steps:  [
      { type: 'request', id: 'list', url: '{{start.url}}', as: 'json' },
      { type: 'extract', id: 'entries', from: 'list', selector: '$.items[*]', kind: 'jsonpath', take: 'json', many: true },
      { type: 'forEach', over: 'entries', as: 'item', emit: true, steps: [] },
    ],
    mapping: { name: { from: 'item.name' } },
  }))

  return folder
}

async function post (server: StudioServer, body: unknown, token = server.token): Promise<Response> {
  return fetch(`http://127.0.0.1${new URL(server.url).port === '' ? '' : `:${new URL(server.url).port}`}/api/command`, {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-opencraw-token': token },
    body:    JSON.stringify(body),
  })
}

describe('startStudioServer', () => {
  let server: StudioServer

  afterEach(async () => { await server?.close() })

  it('rejects a command with a missing or wrong token', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const wrong = await post(server, { type: 'open-workspace', folder: '.' }, 'wrong-token')
    expect(wrong.status).toBe(401)
    const missing = await fetch(new URL('/api/command', server.url.replace(/\?.*/, '')), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(missing.status).toBe(401)
  })

  it('opens a workspace, runs a sample, and streams events over the WebSocket', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = workspace()

    const opened = await post(server, { type: 'open-workspace', folder })
    expect(opened.status).toBe(200)
    const view = await opened.json() as { recipes: unknown[] }
    expect(view.recipes).toHaveLength(2)

    const socket = new WebSocket(`ws://127.0.0.1:${new URL(server.url).port}/ws?token=${server.token}`)
    const events: { type: string }[] = []
    const finished = new Promise<void>((resolve) => {
      socket.addEventListener('message', (event) => {
        const parsed = JSON.parse(String(event.data)) as { type: string }
        events.push(parsed)
        if (parsed.type === 'run-finished') resolve()
      })
    })
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve)
      socket.addEventListener('error', reject)
    })

    const started = await post(server, { type: 'run-sample', recipeId: 'items' })
    expect(await started.json()).toEqual({ started: true })
    await finished
    socket.close()

    expect(events.filter(event => event.type === 'record')).toHaveLength(2)
    expect(events.some(event => event.type === 'trace-line')).toBe(true)
  })

  it('saves a recipe file and fetches an input recipe\'s start page', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = workspace()
    await post(server, { type: 'open-workspace', folder })

    const saved = await post(server, { type: 'save-recipe', path: join(folder, 'item.output.json'), recipe: { kind: 'output', id: 'item', version: 2, fields: {} } })
    expect(await saved.json()).toEqual({ saved: true })

    const page = await post(server, { type: 'fetch-start-page', recipeId: 'items' })
    const body = await page.json() as { html: string }
    expect(JSON.parse(body.html)).toEqual({ items: [{ name: 'a1' }, { name: 'a2' }] })
  })
})

describe('stopping the server', () => {
  it('finishes while a page still holds the event socket open', async () => {
    const server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const socket = new WebSocket(`ws://127.0.0.1:${new URL(server.url).port}/ws?token=${server.token}`)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => { resolve() })
      socket.addEventListener('error', () => { reject(new Error('the event socket did not open')) })
    })

    await expect(server.close()).resolves.toBeUndefined()
  })
})
