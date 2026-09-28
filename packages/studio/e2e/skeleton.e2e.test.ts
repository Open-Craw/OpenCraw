import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import { PRODUCTS, startFixtureSite, stopFixtureSite } from './fixture-site'

const RECIPES_FOLDER = join(__dirname, 'recipes')

function emptyUiRoot (): string {
  return mkdtempSync(join(tmpdir(), 'opencraw-e2e-ui-'))
}

function commandUrl (server: StudioServer): string {
  return `http://127.0.0.1:${new URL(server.url).port}/api/command`
}

async function post (server: StudioServer, body: unknown, token = server.token): Promise<Response> {
  return fetch(commandUrl(server), {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-opencraw-token': token },
    body:    JSON.stringify(body),
  })
}

describe('studio phase 0 skeleton: server against a fixture recipe folder', () => {
  let site: Server
  let server: StudioServer

  beforeAll(async () => { site = await startFixtureSite() })
  afterAll(async () => { await stopFixtureSite(site) })
  afterEach(async () => { await server?.close() })

  it('opens the workspace, runs a sample, and gets the fixture\'s records and a summary trace line back', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })

    const opened = await post(server, { type: 'open-workspace', folder: RECIPES_FOLDER })
    expect(opened.status).toBe(200)
    const workspace = await opened.json() as { recipes: { kind: string, issues: unknown[] }[] }
    expect(workspace.recipes).toHaveLength(2)
    for (const recipe of workspace.recipes) expect(recipe.issues).toEqual([])

    const socket = new WebSocket(`ws://127.0.0.1:${new URL(server.url).port}/ws?token=${server.token}`)
    const traceLines: string[] = []
    const records: { name: string, price: number }[] = []
    const finished = new Promise<{ emitted: number }>((resolve) => {
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as { type: string, line?: string, data?: { name: string, price: number }, emitted?: number }
        if (message.type === 'trace-line' && message.line !== undefined) traceLines.push(message.line)
        if (message.type === 'record' && message.data !== undefined) records.push(message.data)
        if (message.type === 'run-finished') resolve({ emitted: message.emitted ?? 0 })
      })
    })
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve)
      socket.addEventListener('error', reject)
    })

    const started = await post(server, { type: 'run-sample', recipeId: 'products' })
    expect(await started.json()).toEqual({ started: true })
    const result = await finished
    socket.close()

    expect(result.emitted).toBe(PRODUCTS.length)
    expect(records.sort((a, b) => a.name.localeCompare(b.name))).toEqual([...PRODUCTS].sort((a, b) => a.name.localeCompare(b.name)))
    // The trace's summary line, "■ <recipe>: N emitted, ...", the way the cli's --trace prints it.
    expect(traceLines.some(line => line.includes('■') && line.includes(`${PRODUCTS.length} emitted`))).toBe(true)
  })

  it('fetches an input recipe\'s start page as the engine would see it', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    await post(server, { type: 'open-workspace', folder: RECIPES_FOLDER })

    const page = await post(server, { type: 'fetch-start-page', recipeId: 'products' })
    expect(page.status).toBe(200)
    const body = await page.json() as { html: string }
    expect(JSON.parse(body.html)).toEqual({ items: PRODUCTS })
  })

  it('rejects a request with a missing or wrong token with 401', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })

    const wrongToken = await post(server, { type: 'open-workspace', folder: RECIPES_FOLDER }, 'not-the-token')
    expect(wrongToken.status).toBe(401)

    const noToken = await fetch(commandUrl(server), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'open-workspace', folder: RECIPES_FOLDER }) })
    expect(noToken.status).toBe(401)
  })

  it('does not leak the fixture site into an unbounded crawl: the sample budget stops it early', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    await post(server, { type: 'open-workspace', folder: RECIPES_FOLDER })

    const socket = new WebSocket(`ws://127.0.0.1:${new URL(server.url).port}/ws?token=${server.token}`)
    const finished = new Promise<{ stoppedBy?: string, emitted: number }>((resolve) => {
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as { type: string, stoppedBy?: string, emitted?: number }
        if (message.type === 'run-finished') resolve({ stoppedBy: message.stoppedBy, emitted: message.emitted ?? 0 })
      })
    })
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve)
      socket.addEventListener('error', reject)
    })

    await post(server, { type: 'run-sample', recipeId: 'products', budget: { maxRecords: 1 } })
    const result = await finished
    socket.close()

    expect(result.emitted).toBe(1)
    expect(result.stoppedBy).toBe('sample-maxRecords')
  })
})
