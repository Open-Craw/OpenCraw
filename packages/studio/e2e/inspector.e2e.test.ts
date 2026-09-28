import { cpSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { load } from 'cheerio'
import { NODE_ID_ATTRIBUTE } from '@opencraw/core'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { FieldPick, InferSelectorView, InspectView, OutlineCard, OutlineNode, OutlineView, ResponsesSeenView, SnapshotView } from '../src/studio-api'
import { browserConfig, HIDDEN_PROMO_CODE, JSON_LD_PRICE, REVIEWS_PATH, REVIEWS_QUERY_PAGE, startFixtureSite, stopFixtureSite } from './fixture-site'

const RECIPES_FOLDER = join(__dirname, 'recipes-inspecting')

function recipesFolder (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-inspecting-'))
  cpSync(RECIPES_FOLDER, folder, { recursive: true })

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

/** Runs a sample over the event socket and resolves with its first emitted record — mirrors `picking.e2e.test.ts`'s own websocket run, trimmed to what this test needs. */
async function runOneRecord (server: StudioServer, recipeId: string): Promise<Record<string, unknown>> {
  const socket = new WebSocket(`ws://127.0.0.1:${new URL(server.url).port}/ws?token=${server.token}`)
  const traceLines: string[] = []
  const rejected: unknown[] = []
  let outcome: { kind: 'record', data: Record<string, unknown> } | { kind: 'finished', error?: string } | undefined
  socket.addEventListener('message', (event) => {
    if (outcome !== undefined) return
    const message = JSON.parse(String(event.data)) as { type: string, data?: Record<string, unknown>, error?: string, line?: string, reason?: string }
    if (message.type === 'trace-line' && message.line !== undefined) traceLines.push(message.line)
    if (message.type === 'record-rejected') rejected.push(message)
    if (message.type === 'record' && message.data !== undefined) outcome = { kind: 'record', data: message.data }
    if (message.type === 'run-finished') outcome = { kind: 'finished', error: message.error }
  })
  const finished = new Promise<Record<string, unknown>>((resolve, reject) => {
    const poll = setInterval(() => {
      if (outcome === undefined) return
      clearInterval(poll)
      if (outcome.kind === 'record') resolve(outcome.data)
      else reject(new Error(`run finished with no record${outcome.error === undefined ? '' : `: ${outcome.error}`}\nrejected: ${JSON.stringify(rejected)}\ntrace:\n${traceLines.join('\n')}`))
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

interface RecipeListing {
  file:     string
  kind:     string
  id?:      string
  outline?: OutlineView
}

/** Every `data-oc-node` id whose element matches `selector` — mirrors `picking.e2e.test.ts`'s own copy (each e2e file is self-contained; see `docs/architecture/vertical-feature-slices.md`'s note that `e2e/` sits outside the slice rules). */
function nodeIdsOf (html: string, selector: string): string[] {
  const $ = load(html)

  return $(selector).map((_index, element) => $(element).attr(NODE_ID_ATTRIBUTE)).get()
}

/** Builds a `Read` card exactly as `apps/studio-ui/src/content-pane/outline-from-pick.mapper.ts`'s `readCardNode` does (that file cannot be imported from here — it is UI code, `@opencraw/studio`'s own e2e stays server-side), so this test proves `page-inspector`'s output is exactly what the UI's own mapper expects. */
function readCard (field: FieldPick, path: string, id = 'value'): OutlineCard {
  return { kind: 'card', path, stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id, selector: field.selector, kind: 'css', ...(field.take !== 'text' && { take: field.take }) } }
}

describe('studio phase 4: the Inspect panel (#93)', () => {
  let site: Server
  let server: StudioServer

  beforeAll(async () => { site = await startFixtureSite() })
  afterAll(async () => { await stopFixtureSite(site) })
  afterEach(async () => { await server?.close() })

  it('picks a hidden input\'s value from the tree, a JSON-LD field (a jsonpath card), and switches to api mode from a response', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot(), browser: browserConfig() })
    const folder = recipesFolder()
    const recipePath = join(folder, 'books.input.json')

    await post(server, { type: 'open-workspace', folder })
    const snapshot = await post<SnapshotView>(server, { type: 'take-snapshot', recipeId: 'books', path: 'start' })

    // --- 1. The DOM tree: a hidden input's value, picked as an attribute (the tree's own default pick, `take: text`, would read its empty text content — the issue's right-click "read as an attribute" is exactly why this exists) ---
    const inspect = await post<InspectView>(server, { type: 'inspect-page', recipeId: 'books', path: 'start' })
    const promoNodeId = nodeIdsOf(snapshot.html, '#promo-code')[0]
    expect(promoNodeId).toBeDefined()
    const promoNode = findInTree(inspect.tree, node => node.nodeId === promoNodeId)
    expect(promoNode).toMatchObject({ tag: 'input', hidden: true, id: 'promo-code' })
    expect(promoNode?.attributes.value).toBe(HIDDEN_PROMO_CODE) // the value itself, only reachable as an attribute — never rendered text

    const promoPick = await post<InferSelectorView>(server, { type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: [promoNodeId] })
    if (promoPick.kind !== 'field') throw new Error(`expected a field pick, got ${promoPick.kind}`)
    const promoField: FieldPick = { ...promoPick.field, take: 'attr:value' } // the context menu's "As an attribute" -> "value"

    // --- 2. Data in the page: the JSON-LD block's own "price" key (a plain Read — take defaults to "text", the convention every JSON-LD read in this repo's recipes uses — then a jsonpath card) ---
    const ldJson = inspect.pageData.find(finding => finding.kind === 'ld-json')
    if (ldJson === undefined) throw new Error('expected a ld-json finding')
    expect(ldJson.keys).toEqual(expect.arrayContaining(['price', 'name']))
    expect(ldJson.matches).toBe(1)

    const opened = await post<{ recipes: RecipeListing[] }>(server, { type: 'open-workspace', folder })
    const books = opened.recipes.find(recipe => recipe.id === 'books')
    if (books?.outline === undefined) throw new Error('expected the books recipe to have an outline')

    const promoCard = readCard(promoField, 'steps.1', 'promoCode')
    const ldJsonCard: OutlineCard = { kind: 'card', path: 'steps.2', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'ldjson', selector: ldJson.selector, kind: 'css' } }
    const jsonpathCard: OutlineCard = { kind: 'card', path: 'steps.3', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'ldjson_price', from: 'ldjson', selector: '$.price', kind: 'jsonpath' } }
    const steps: OutlineNode[] = [...books.outline.steps, promoCard, ldJsonCard, jsonpathCard]
    await post(server, { type: 'save-outline', path: recipePath, outline: { ...books.outline, steps } })

    const afterPicks = JSON.parse(readFileSync(recipePath, 'utf8')) as { steps: { type: string, id?: string, selector?: string, kind?: string, take?: string, from?: string }[] }
    expect(afterPicks.steps).toEqual([
      { type: 'goto', url: '{{start.url}}' },
      { type: 'extract', id: 'promoCode', selector: '#promo-code', kind: 'css', take: 'attr:value' },
      { type: 'extract', id: 'ldjson', selector: ldJson.selector, kind: 'css' },
      { type: 'extract', id: 'ldjson_price', from: 'ldjson', selector: '$.price', kind: 'jsonpath' },
    ])
    expect(promoField.selector).toBe('#promo-code') // the id candidate, ranked above class/structure — same ranking a visible pick gets

    // A real run proves the jsonpath card is not just well-formed JSON but a recipe that actually works: the JSON-LD block's "price" key, read out correctly (the output recipe declares "price" only; the hidden input's own pick is already proven above by the exact step its selector/take landed as). An explicit `emit` (the "+" menu's own "Emit" option) is needed since this flat, non-looping page has no `forEach` to emit for it.
    const afterPicksRecipe = JSON.parse(readFileSync(recipePath, 'utf8')) as { steps: unknown[] } & Record<string, unknown>
    const withEmitAndMapping = { ...afterPicksRecipe, steps: [...afterPicksRecipe.steps, { type: 'emit' }], mapping: { price: { from: 'ldjson_price' } } }
    await post(server, { type: 'save-recipe', path: recipePath, recipe: withEmitAndMapping })
    const record = await runOneRecord(server, 'books')
    expect(record).toEqual({ price: String(JSON_LD_PRICE) }) // the output field is declared "type": "string" (book.output.json)

    // --- 3. Responses seen: the XHR the page fired while it rendered, picked to switch the recipe to api mode ---
    const responses = await post<ResponsesSeenView>(server, { type: 'responses-seen', recipeId: 'books', path: 'start' })
    const reviews = responses.responses.find(response => response.url.includes(REVIEWS_PATH))
    if (reviews === undefined) throw new Error(`expected a response for ${REVIEWS_PATH} among ${JSON.stringify(responses.responses)}`)
    expect(reviews.status).toBe(200)
    expect(reviews.url).toBe(`http://127.0.0.1:4599${REVIEWS_PATH}?page=${REVIEWS_QUERY_PAGE}`)

    // Switching to api mode: mirrors `apps/studio-ui/src/inspector/switch-to-api-mode.mapper.ts` (unit-tested there) — query values matching a `vars` entry templated, `{{vars.page}}` for `?page=1`; built by hand, not through `URLSearchParams#toString`, which would percent-encode the template's own braces.
    const parsedRecipe = JSON.parse(readFileSync(recipePath, 'utf8')) as { mode: string, vars?: Record<string, unknown>, start: { url: string }[], steps: unknown[] }
    expect(parsedRecipe.mode).toBe('web') // still web mode, before the switch
    const apiModeUrl = `http://127.0.0.1:4599${REVIEWS_PATH}?page={{vars.page}}`
    const switched = { ...parsedRecipe, mode: 'api', start: [{ url: apiModeUrl }], steps: [{ type: 'request', id: 'response', url: '{{start.url}}', as: 'json' }] }
    await post(server, { type: 'save-recipe', path: recipePath, recipe: switched })

    const afterSwitch = JSON.parse(readFileSync(recipePath, 'utf8')) as { mode: string, start: { url: string }[], steps: { type: string, id?: string, url?: string, as?: string }[] }
    expect(afterSwitch.mode).toBe('api')
    expect(afterSwitch.start).toEqual([{ url: `http://127.0.0.1:4599${REVIEWS_PATH}?page={{vars.page}}` }])
    expect(afterSwitch.steps).toEqual([{ type: 'request', id: 'response', url: '{{start.url}}', as: 'json' }])
  }, 60000)
})

function findInTree (tree: InspectView['tree'], match: (node: InspectView['tree']) => boolean): InspectView['tree'] | undefined {
  if (match(tree)) return tree
  for (const child of tree.children) {
    const found = findInTree(child, match)
    if (found !== undefined) return found
  }

  return undefined
}
