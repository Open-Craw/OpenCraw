import { cpSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { load } from 'cheerio'
import { NODE_ID_ATTRIBUTE } from '@opencraw/core'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { InferSelectorView, OutlineBracket, OutlineCard, OutlineNode, OutlineView, SnapshotView } from '../src/studio-api'
import { BOOK_COUNT, browserConfig, startFixtureSite, stopFixtureSite } from './fixture-site'

const RECIPES_FOLDER = join(__dirname, 'recipes-picking')

function recipesFolder (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-picking-'))
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

interface RecipeListing {
  file:     string
  kind:     string
  id?:      string
  issues:   { path: string, message: string, kind: string }[]
  outline?: OutlineView
}

/** Every `data-oc-node` id whose element matches `selector`, in document order — what the content pane's picker overlay would hand `infer-selector` after a click. */
function nodeIdsOf (html: string, selector: string): string[] {
  const $ = load(html)

  return $(selector).map((_index, element) => $(element).attr(NODE_ID_ATTRIBUTE)).get()
}

describe('studio phase 2: picking on web pages (#91)', () => {
  let site: Server
  let server: StudioServer

  beforeAll(async () => { site = await startFixtureSite() })
  afterAll(async () => { await stopFixtureSite(site) })
  afterEach(async () => { await server?.close() })

  it('pick a price, then a second price: a Read card, then the safe extract+forEach shape on disk, then a real run emitting every book', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot(), browser: browserConfig() })
    const folder = recipesFolder()
    const recipePath = join(folder, 'books.input.json')

    await post(server, { type: 'open-workspace', folder })

    // 1. Take the snapshot of the start page: a books.toscrape-shaped listing.
    const snapshot = await post<SnapshotView>(server, { type: 'take-snapshot', recipeId: 'books', path: 'start' })
    expect(snapshot.nodeCount).toBeGreaterThan(0)
    const priceNodeIds = nodeIdsOf(snapshot.html, '.price_color')
    expect(priceNodeIds).toHaveLength(BOOK_COUNT)

    // 2. First click: infer-selector with one node id gives a single field, verified against the snapshot.
    const firstPick = await post<InferSelectorView>(server, { type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: [priceNodeIds[0]] })
    if (firstPick.kind !== 'field') throw new Error(`expected a field pick, got ${firstPick.kind}`)
    expect(firstPick.field.selector).toBe('p.price_color')
    expect(firstPick.field.matches).toBe(BOOK_COUNT) // correctly ambiguous without item scoping — this is exactly why a second pick is needed

    // Write it as a Read card (what the content pane does with a first pick): appended after the recipe's existing "Go to" step (steps.0), the outline the workspace already returned.
    const opened = await post<{ recipes: RecipeListing[] }>(server, { type: 'open-workspace', folder })
    const books = opened.recipes.find(recipe => recipe.id === 'books')
    if (books?.outline === undefined) throw new Error('expected the books recipe to have an outline')
    expect(books.outline.steps).toHaveLength(1) // the seeded "Go to" step, before any pick
    const readCard: OutlineCard = {
      kind:     'card',
      path:     'steps.1',
      stepType: 'extract',
      sentence: [],
      custom:   false,
      step:     { type: 'extract', id: 'value', selector: firstPick.field.selector, kind: 'css' },
    }
    await post(server, { type: 'save-outline', path: recipePath, outline: { ...books.outline, steps: [...books.outline.steps, readCard] } })

    const afterFirstPick = JSON.parse(readFileSync(recipePath, 'utf8')) as { steps: unknown[] }
    expect(afterFirstPick.steps).toEqual([{ type: 'goto', url: '{{start.url}}' }, { type: 'extract', id: 'value', selector: 'p.price_color', kind: 'css' }])

    // 3. Second click, on a similar price: infer-selector with both node ids gives the safe list shape.
    const secondPick = await post<InferSelectorView>(server, { type: 'infer-selector', recipeId: 'books', path: 'start', nodeIds: [priceNodeIds[0], priceNodeIds[1]] })
    if (secondPick.kind !== 'list') throw new Error(`expected a list pick, got ${secondPick.kind}`)
    expect(secondPick.item.selector).toBe('article.product_pod')
    expect(secondPick.item.matches).toBe(BOOK_COUNT)
    expect(secondPick.field.selector).toBe('p.price_color')

    // Upgrade the single Read card (steps.1) into the safe extract(items)+forEach(field from item) shape, replacing it in place; the "Go to" step (steps.0) is untouched.
    const itemsCard: OutlineCard = {
      kind:     'card',
      path:     'steps.1',
      stepType: 'extract',
      sentence: [],
      custom:   false,
      step:     { type: 'extract', id: 'items', selector: secondPick.item.selector, kind: 'css', take: 'html', many: true },
    }
    const fieldCard: OutlineCard = {
      kind:     'card',
      path:     'steps.2.steps.0',
      stepType: 'extract',
      sentence: [],
      custom:   false,
      step:     { type: 'extract', id: 'value', from: 'item', selector: secondPick.field.selector, kind: 'css' },
    }
    const forEachNode: OutlineBracket = {
      kind:     'bracket',
      path:     'steps.2',
      stepType: 'forEach',
      sentence: [],
      children: [fieldCard],
      step:     { type: 'forEach', over: 'items', as: 'item', emit: true, steps: [] },
    }
    const listSteps: OutlineNode[] = [books.outline.steps[0], itemsCard, forEachNode]
    await post(server, { type: 'save-outline', path: recipePath, outline: { ...books.outline, steps: listSteps } })

    // 4. The safe shape landed on disk exactly as constructed by list inference: never a selector read against the whole document and zipped by index.
    const saved = JSON.parse(readFileSync(recipePath, 'utf8')) as { steps: { type: string, id?: string, url?: string, selector?: string, kind?: string, take?: string, many?: boolean, over?: string, as?: string, emit?: boolean, steps?: { type: string, id: string, from?: string, selector: string }[] }[] }
    expect(saved.steps).toEqual([
      { type: 'goto', url: '{{start.url}}' },
      { type: 'extract', id: 'items', selector: 'article.product_pod', kind: 'css', take: 'html', many: true },
      { type: 'forEach', over: 'items', as: 'item', emit: true, steps: [{ type: 'extract', id: 'value', from: 'item', selector: 'p.price_color', kind: 'css' }] },
    ])

    // 5. A real sample run of the saved recipe emits one record per book, each with the item's own price — not a shifted or wrapper-trapped value.
    const socket = new WebSocket(`ws://127.0.0.1:${new URL(server.url).port}/ws?token=${server.token}`)
    const records: { price: string }[] = []
    const traceLines: string[] = []
    const finished = new Promise<{ emitted: number, error?: string }>((resolve) => {
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as { type: string, data?: { price: string }, emitted?: number, error?: string, line?: string }
        if (message.type === 'trace-line' && message.line !== undefined) traceLines.push(message.line)
        if (message.type === 'record' && message.data !== undefined) records.push(message.data)
        if (message.type === 'run-finished') resolve({ emitted: message.emitted ?? 0, error: message.error })
      })
    })
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve)
      socket.addEventListener('error', reject)
    })

    await post(server, { type: 'run-sample', recipeId: 'books' })
    const result = await finished
    socket.close()
    if (result.emitted !== BOOK_COUNT) console.log('picking e2e: unexpected run result', result, '\ntrace:\n', traceLines.join('\n'))

    expect(result.emitted).toBe(BOOK_COUNT)
    const prices = records.map(record => record.price).sort((a, b) => a.localeCompare(b))
    const expectedPrices = Array.from({ length: BOOK_COUNT }, (_, index) => `£${(11 + index).toFixed(2)}`).sort((a, b) => a.localeCompare(b))
    expect(prices).toEqual(expectedPrices)
  }, 60000)
})
