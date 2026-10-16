import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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

  it('builds links that open a path in the browser, keeping the token and the workspace', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot(), initialFolder: '/work/recipes' })

    const plain = new URL(server.link())
    const document = new URL(server.link({ open: '/work/docs/Q3 report.pdf', workspace: '/other' }))

    expect(plain.searchParams.get('token')).toBe(server.token)
    expect(plain.searchParams.get('folder')).toBe('/work/recipes')
    expect(plain.searchParams.has('open')).toBe(false)
    expect(document.searchParams.get('token')).toBe(server.token)
    expect(document.searchParams.get('folder')).toBe('/other')
    expect(document.searchParams.get('open')).toBe('/work/docs/Q3 report.pdf')
  })

  it('answers open-path with what the path is', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = workspace()

    const answer = await post(server, { type: 'open-path', path: folder })
    const missing = await post(server, { type: 'open-path', path: join(folder, 'nope.pdf') })

    expect(await answer.json()).toEqual({ kind: 'folder', folder })
    expect(missing.status).toBe(500)
  })

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

/** Sends a command and reads the JSON answer. */
async function answer<T = unknown> (server: StudioServer, body: unknown): Promise<T> {
  const response = await post(server, body)

  return await response.json() as T
}

function instancesDirectory (): string {
  return mkdtempSync(join(tmpdir(), 'opencraw-instances-'))
}

function portOf (server: StudioServer): string {
  return new URL(server.url).port
}

describe('controlling a running studio', () => {
  let server: StudioServer

  afterEach(async () => { await server?.close() })

  it('announces itself to controllers while it runs and withdraws the announcement when it stops', async () => {
    const instancesDir = instancesDirectory()
    const running = await startStudioServer({ uiRoot: emptyUiRoot(), initialFolder: '/work', instancesDir })
    const port = portOf(running)

    const [file] = readdirSync(instancesDir)
    expect(file).toBe(`${String(process.pid)}-${port}.json`)
    const announced: unknown = JSON.parse(readFileSync(join(instancesDir, file), 'utf8'))
    expect(announced).toMatchObject({ pid: process.pid, url: `http://127.0.0.1:${port}`, token: running.token, folder: '/work' })
    await running.close()
    expect(readdirSync(instancesDir)).toEqual([])
  })

  it('tells every open page what a controller asked, and says how many were listening', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot(), instancesDir: instancesDirectory() })
    const ask = { type: 'ask-ui', request: { kind: 'open', path: '/work/a.input.json' } }
    expect(await answer(server, ask)).toMatchObject({ pages: 0 })

    const socket = new WebSocket(`ws://127.0.0.1:${portOf(server)}/ws?token=${server.token}`)
    const heard = new Promise<unknown>((resolve) => {
      socket.addEventListener('message', (event) => {
        resolve(JSON.parse(String(event.data)))
      })
    })
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve)
      socket.addEventListener('error', reject)
    })

    const asked = await answer<{ pages: number, requestId: string }>(server, ask)
    expect(asked.pages).toBe(1)
    expect(await heard).toEqual({ type: 'ui-request', requestId: asked.requestId, request: ask.request })
    socket.close()
  })

  it('keeps what a page reports about a request, for the controller to ask for', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot(), instancesDir: instancesDirectory() })
    const { requestId } = await answer<{ requestId: string }>(server, { type: 'ask-ui', request: { kind: 'pick', recipeId: 'items', text: 'Clio' } })
    expect(await answer(server, { type: 'ui-outcome', requestId })).toEqual({ state: 'pending' })

    expect(await answer(server, { type: 'ui-report', requestId, ok: true, message: 'staged', detail: { selector: 'h1' } })).toEqual({ kept: true })
    expect(await answer(server, { type: 'ui-report', requestId, ok: false, message: 'a second page', detail: {} })).toEqual({ kept: false })

    expect(await answer(server, { type: 'ui-outcome', requestId })).toEqual({ state: 'done', ok: true, message: 'staged', detail: { selector: 'h1' } })
  })

  it('reports a sample run as never run, then finished with its first records', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot(), instancesDir: instancesDirectory() })
    const folder = workspace()
    const status = { type: 'run-status', recipeId: 'items' }
    await post(server, { type: 'open-workspace', folder })
    expect(await answer(server, status)).toEqual({ recipeId: 'items', state: 'never-run' })
    expect(await answer(server, { type: 'studio-status' })).toMatchObject({ folder, pages: 0 })

    await post(server, { type: 'run-sample', recipeId: 'items' })
    let view = await answer<{ state: string, result?: { emitted: number, records: { data: unknown }[] } }>(server, status)
    while (view.state === 'running') view = await answer(server, status)

    expect(view.state).toBe('finished')
    expect(view.result?.emitted).toBe(2)
    expect(view.result?.records.map(record => record.data)).toEqual([{ name: 'a1' }, { name: 'a2' }])
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
