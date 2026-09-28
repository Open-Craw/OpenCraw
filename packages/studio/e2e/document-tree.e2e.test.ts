import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { DocumentTreeNodeView, DocumentTreeView, OutlineNode, SnapshotView } from '../src/studio-api'

const POKEMON_FIXTURE = join(__dirname, 'recipes-documents', 'pokemon.json')

/** A fresh recipes folder with an api-mode recipe whose `start.url` is a `file://` URL to the checked-in PokeAPI-shaped fixture — `HttpClient` reads `file:` URLs the same way it reads a fetched response, so no fixture HTTP server is needed for a JSON document (`http.client.ts`'s `readLocalFile`). */
function recipesFolder (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-documents-'))
  writeFileSync(join(folder, 'pokemon.output.json'), JSON.stringify({ kind: 'output', id: 'pokemon', version: 1, fields: { name: { type: 'string', required: true, key: true } } }))
  writeFileSync(join(folder, 'pokemon.input.json'), JSON.stringify({
    kind:    'input',
    id:      'pokemon',
    output:  'pokemon',
    mode:    'api',
    start:   [{ url: `file://${POKEMON_FIXTURE}` }],
    steps:   [{ type: 'request', id: 'doc', url: '{{start.url}}', as: 'json' }],
    mapping: {},
  }))

  return folder
}

function emptyUiRoot (): string {
  return mkdtempSync(join(tmpdir(), 'opencraw-e2e-ui-'))
}

function commandUrl (server: StudioServer): string {
  return `http://127.0.0.1:${new URL(server.url).port}/api/command`
}

async function post<T> (server: StudioServer, body: unknown): Promise<T> {
  const response = await fetch(commandUrl(server), {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-opencraw-token': server.token },
    body:    JSON.stringify(body),
  })
  if (response.status !== 200) {
    const text = await response.text()
    throw new Error(`${response.status} on ${JSON.stringify(body)}: ${text}`)
  }

  return response.json() as Promise<T>
}

/** Runs a sample over the event socket and resolves with its first emitted record — mirrors `inspector.e2e.test.ts`'s own copy. */
async function runOneRecord (server: StudioServer, recipeId: string): Promise<Record<string, unknown>> {
  const socket = new WebSocket(`ws://127.0.0.1:${new URL(server.url).port}/ws?token=${server.token}`)
  const traceLines: string[] = []
  let outcome: { kind: 'record', data: Record<string, unknown> } | { kind: 'finished', error?: string } | undefined
  socket.addEventListener('message', (event) => {
    if (outcome !== undefined) return
    const message = JSON.parse(String(event.data)) as { type: string, data?: Record<string, unknown>, error?: string, line?: string }
    if (message.type === 'trace-line' && message.line !== undefined) traceLines.push(message.line)
    if (message.type === 'record' && message.data !== undefined) outcome = { kind: 'record', data: message.data }
    if (message.type === 'run-finished') outcome = { kind: 'finished', error: message.error }
  })
  const finished = new Promise<Record<string, unknown>>((resolve, reject) => {
    const poll = setInterval(() => {
      if (outcome === undefined) return
      clearInterval(poll)
      if (outcome.kind === 'record') resolve(outcome.data)
      else reject(new Error(`run finished with no record${outcome.error === undefined ? '' : `: ${outcome.error}`}\ntrace:\n${traceLines.join('\n')}`))
    }, 10)
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve)
    socket.addEventListener('error', reject)
  })
  await post(server, { type: 'run-sample', recipeId, budget: { maxRecords: 1 } })
  try {
    return await finished
  } finally {
    socket.close()
  }
}

function findNode (node: DocumentTreeNodeView, id: string): DocumentTreeNodeView | undefined {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findNode(child, id)
    if (found !== undefined) return found
  }

  return undefined
}

describe('studio phase 5a: the document tree (#94)', () => {
  let server: StudioServer

  afterEach(async () => { await server?.close() })

  it('reads a PokeAPI-shaped JSON document as a tree, picks a value into a jsonpath Read card that actually runs, and generalises a list item to [*] with its count', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder()
    const recipePath = join(folder, 'pokemon.input.json')

    await post(server, { type: 'open-workspace', folder })
    const snapshot = await post<SnapshotView>(server, { type: 'take-snapshot', recipeId: 'pokemon', path: 'start' })
    expect(snapshot.format).toBe('json') // what the content pane uses to choose the tree canvas over the iframe (issue #94's 5a)

    // --- 1. The tree: a scalar value's exact jsonpath ---
    const tree = await post<DocumentTreeView>(server, { type: 'document-tree', recipeId: 'pokemon', path: 'start' })
    expect(tree.format).toBe('json')
    const firstName = findNode(tree.root, '$.results[0].name')
    expect(firstName).toMatchObject({ valueType: 'string', preview: 'bulbasaur', jsonpath: '$.results[0].name' })

    // --- 2. A value inside a list generalises to the whole list, with the match count shown ---
    expect(firstName?.listPath).toBe('$.results[*].name')
    expect(firstName?.listCount).toBe(3)

    // --- 3. The pick writes exactly the card `documentReadCardNode` builds (apps/studio-ui/src/content-pane/outline-from-pick.mapper.ts; proven here from the server side, same as picking.e2e.test.ts/inspector.e2e.test.ts do for the DOM/css picks) ---
    const opened = await post<{ recipes: { id?: string, outline?: { steps: OutlineNode[] } & Record<string, unknown> } [] }>(server, { type: 'open-workspace', folder })
    const pokemon = opened.recipes.find(recipe => recipe.id === 'pokemon')
    if (pokemon?.outline === undefined) throw new Error('expected the pokemon recipe to have an outline')
    const valueCard: OutlineNode = { kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'value', selector: firstName?.jsonpath, kind: 'jsonpath' } }
    const emitStep: OutlineNode = { kind: 'card', path: 'steps.2', stepType: 'emit', sentence: [], custom: false, step: { type: 'emit' } }
    await post(server, { type: 'save-outline', path: recipePath, outline: { ...pokemon.outline, steps: [...pokemon.outline.steps, valueCard, emitStep] } })

    const afterValuePick = JSON.parse(readFileSync(recipePath, 'utf8')) as { steps: { type: string, id?: string, selector?: string, kind?: string }[] }
    expect(afterValuePick.steps).toEqual([
      { type: 'request', id: 'doc', url: '{{start.url}}', as: 'json' },
      { type: 'extract', id: 'value', selector: '$.results[0].name', kind: 'jsonpath' },
      { type: 'emit' },
    ])

    // A real run proves the jsonpath card is not just well-formed JSON but a recipe that actually reads the fixture correctly.
    const afterPickRecipe = JSON.parse(readFileSync(recipePath, 'utf8')) as Record<string, unknown>
    await post(server, { type: 'save-recipe', path: recipePath, recipe: { ...afterPickRecipe, mapping: { name: { from: 'value' } } } })
    const record = await runOneRecord(server, 'pokemon')
    expect(record).toEqual({ name: 'bulbasaur' })

    // --- 4. The generalised list card: many: true, every one of the 3 names ---
    const listCard: OutlineNode = { kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'names', selector: firstName?.listPath, kind: 'jsonpath', many: true } }
    await post(server, { type: 'save-outline', path: recipePath, outline: { ...pokemon.outline, steps: [...pokemon.outline.steps, listCard] } })
    const afterListPick = JSON.parse(readFileSync(recipePath, 'utf8')) as { steps: { type: string, id?: string, selector?: string, kind?: string, many?: boolean }[] }
    expect(afterListPick.steps.at(-1)).toEqual({ type: 'extract', id: 'names', selector: '$.results[*].name', kind: 'jsonpath', many: true })
  }, 30000)
})
