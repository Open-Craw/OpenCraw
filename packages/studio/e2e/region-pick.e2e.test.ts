import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { DeckDocumentView, OutlineNode, PdfDocumentView, RegionPreviewView, SnapshotView } from '../src/studio-api'

const DISCOUNTS_FIXTURE = join(__dirname, '..', '..', 'core', 'src', 'pdf-document', 'fixtures', 'discounts.pdf')
/** `@opencraw/office-reader`'s own presentation fixture: slide 3 ("Vendite") carries a "Fonte: UNRAE" text box, outside any table. */
const INCENTIVI_FIXTURE = join(__dirname, '..', '..', 'office-reader', 'src', 'presentation', 'fixtures', 'incentivi.pptx')

/** An api-mode recipe `id` over a document fixture (the same shape `pdf-canvas.e2e.test.ts` uses), with the one output field the region will fill. */
function recipesFolder (id: string, fixture: string, field: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-region-'))
  writeFileSync(join(folder, `${id}.output.json`), JSON.stringify({ kind: 'output', id, version: 1, fields: { [field]: { type: 'string', required: true, key: true } } }))
  writeFileSync(join(folder, `${id}.input.json`), JSON.stringify({
    kind:    'input',
    id,
    output:  id,
    mode:    'api',
    start:   [{ url: pathToFileURL(fixture).href }],
    steps:   [{ type: 'request', id: 'doc', url: '{{start.url}}' }],
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

/** Runs a sample over the event socket and resolves with the first emitted record — mirrors `document-tree.e2e.test.ts`'s `runOneRecord`. */
async function runOneRecord (server: StudioServer, recipeId: string): Promise<Record<string, unknown>> {
  const socket = new WebSocket(`ws://127.0.0.1:${new URL(server.url).port}/ws?token=${server.token}`)
  const traceLines: string[] = []
  let record: Record<string, unknown> | undefined
  let finishedError: string | undefined
  let finished = false
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { type: string, data?: Record<string, unknown>, error?: string, line?: string }
    if (message.type === 'trace-line' && message.line !== undefined) traceLines.push(message.line)
    if (message.type === 'record' && message.data !== undefined) record ??= message.data
    if (message.type === 'run-finished') {
      finished = true
      finishedError = message.error
    }
  })
  const done = new Promise<void>((resolve, reject) => {
    const poll = setInterval(() => {
      if (!finished) return
      clearInterval(poll)
      if (finishedError === undefined) resolve()
      else reject(new Error(`run finished with an error: ${finishedError}\ntrace:\n${traceLines.join('\n')}`))
    }, 10)
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve)
    socket.addEventListener('error', reject)
  })
  await post(server, { type: 'run-sample', recipeId, budget: { maxRecords: 1 } })
  try {
    await done
    if (record === undefined) throw new Error('the run emitted no record')

    return record
  } finally {
    socket.close()
  }
}

/** Mirrors `apps/studio-ui/src/content-pane/pdf-pick.mapper.ts`'s `regionSelector`: whole points, as the canvases write them. */
function regionSelector (on: 'page' | 'slide', at: number, x1: number, y1: number, x2: number, y2: number): string {
  return `${on}=${String(at)} x=${String(Math.round(x1))}..${String(Math.round(x2))} y=${String(Math.round(y1))}..${String(Math.round(y2))}`
}

/** "Add to recipe": the region card the pick builds, appended to the outline (then an emit) and saved; answers the saved recipe. */
async function addRegionCard (server: StudioServer, folder: string, recipeId: string, id: string, selector: string): Promise<Record<string, unknown> & { steps: unknown[] }> {
  const recipePath = join(folder, `${recipeId}.input.json`)
  const opened = await post<{ recipes: { id?: string, outline?: { steps: OutlineNode[] } & Record<string, unknown> }[] }>(server, { type: 'open-workspace', folder })
  const recipe = opened.recipes.find(candidate => candidate.id === recipeId)
  if (recipe?.outline === undefined) throw new Error(`expected the ${recipeId} recipe to have an outline`)
  const regionCard: OutlineNode = { kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id, kind: 'region', selector } }
  const emitCard: OutlineNode = { kind: 'card', path: 'steps.2', stepType: 'emit', sentence: [], custom: false, step: { type: 'emit' } }
  await post(server, { type: 'save-outline', path: recipePath, outline: { ...recipe.outline, steps: [...recipe.outline.steps, regionCard, emitCard] } })

  return JSON.parse(readFileSync(recipePath, 'utf8')) as Record<string, unknown> & { steps: unknown[] }
}

describe('clicking a line on the PDF canvas: a region extract (#121)', () => {
  let server: StudioServer
  afterEach(async () => { await server?.close() })

  it('previews the snapped cell as the engine reads it, writes the region card the pick builds, and a real run binds the title', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder('discounts', DISCOUNTS_FIXTURE, 'title')
    const recipePath = join(folder, 'discounts.input.json')
    await post(server, { type: 'open-workspace', folder })
    const snapshot = await post<SnapshotView>(server, { type: 'take-snapshot', recipeId: 'discounts', path: 'start' })
    expect(snapshot.format).toBe('pdf')

    // 1. The canvas snaps to a cell: the title line, outside any table, by its own box off pdf-view.
    const view = await post<PdfDocumentView>(server, { type: 'pdf-view', recipeId: 'discounts', path: 'start' })
    const title = view.pages[0].rows.flatMap(row => row.cells).find(cell => cell.text.startsWith('DEALER DISCOUNTS'))
    if (title === undefined) throw new Error('the fixture lost its title line')
    const selector = regionSelector('page', 1, title.x, title.y, title.x + title.width, title.y + title.height)

    // 2. The staged selection's preview: what the engine will read, and the cells to highlight.
    const preview = await post<RegionPreviewView>(server, { type: 'region-preview', recipeId: 'discounts', path: 'start', selector })
    expect(preview.error).toBeUndefined()
    expect(preview.matches).toEqual([{ page: 1, text: title.text, cells: [title], shapes: [] }])

    // 3. "Add to recipe": the region card the pick builds, appended to the outline and saved.
    const saved = await addRegionCard(server, folder, 'discounts', 'title', selector)
    expect(saved.steps[1]).toEqual({ type: 'extract', id: 'title', kind: 'region', selector })

    // 4. A real run: the region binds the title, the mapping emits it.
    await post(server, { type: 'save-recipe', path: recipePath, recipe: { ...saved, mapping: { title: { from: 'title' } } } })
    const record = await runOneRecord(server, 'discounts')
    expect(record).toEqual({ title: title.text })
  }, 30000)
})

describe('clicking a text box on the deck canvas: a region extract (#122)', () => {
  let server: StudioServer
  afterEach(async () => { await server?.close() })

  it('previews the snapped text box as the engine reads it, writes the region card the pick builds, and a real run binds the source line', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder('incentivi', INCENTIVI_FIXTURE, 'source')
    const recipePath = join(folder, 'incentivi.input.json')
    await post(server, { type: 'open-workspace', folder })
    const snapshot = await post<SnapshotView>(server, { type: 'take-snapshot', recipeId: 'incentivi', path: 'start' })
    expect(snapshot.format).toBe('pptx')

    // 1. The canvas snaps to a text box: the source line on slide 3, outside any table, by its own box off deck-view.
    const view = await post<DeckDocumentView>(server, { type: 'deck-view', recipeId: 'incentivi', path: 'start' })
    const slide = view.slides.find(candidate => candidate.number === 3)
    const source = slide?.shapes.find(shape => shape.text.startsWith('Fonte'))
    if (source === undefined) throw new Error('the fixture lost its source line')
    const selector = regionSelector('slide', 3, source.x, source.y, source.x + source.width, source.y + source.height)

    // 2. The staged selection's preview: what the engine will read, and the text box to highlight.
    const preview = await post<RegionPreviewView>(server, { type: 'region-preview', recipeId: 'incentivi', path: 'start', selector })
    expect(preview.error).toBeUndefined()
    expect(preview.matches).toEqual([{ page: 3, text: source.text, cells: [], shapes: [source] }])

    // 3. "Add to recipe", 4. a real run: the region binds the source line, the mapping emits it.
    const saved = await addRegionCard(server, folder, 'incentivi', 'source', selector)
    expect(saved.steps[1]).toEqual({ type: 'extract', id: 'source', kind: 'region', selector })
    await post(server, { type: 'save-recipe', path: recipePath, recipe: { ...saved, mapping: { source: { from: 'source' } } } })
    const record = await runOneRecord(server, 'incentivi')
    expect(record).toEqual({ source: source.text })
  }, 30000)
})
