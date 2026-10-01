import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { OutlineNode, PdfDocumentView, RegionPreviewView, SnapshotView } from '../src/studio-api'

const DISCOUNTS_FIXTURE = join(__dirname, '..', '..', 'core', 'src', 'pdf-document', 'fixtures', 'discounts.pdf')

/** The same api-mode recipe over core's PDF fixture `pdf-canvas.e2e.test.ts` uses, with the output field the region will fill. */
function recipesFolder (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-region-'))
  writeFileSync(join(folder, 'discounts.output.json'), JSON.stringify({ kind: 'output', id: 'discounts', version: 1, fields: { title: { type: 'string', required: true, key: true } } }))
  writeFileSync(join(folder, 'discounts.input.json'), JSON.stringify({
    kind:    'input',
    id:      'discounts',
    output:  'discounts',
    mode:    'api',
    start:   [{ url: pathToFileURL(DISCOUNTS_FIXTURE).href }],
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

/** Mirrors `apps/studio-ui/src/content-pane/pdf-pick.mapper.ts`'s `regionSelector`: whole points, as the canvas writes them. */
function regionSelector (page: number, x1: number, y1: number, x2: number, y2: number): string {
  return `page=${String(page)} x=${String(Math.round(x1))}..${String(Math.round(x2))} y=${String(Math.round(y1))}..${String(Math.round(y2))}`
}

describe('clicking a line on the PDF canvas: a region extract (#121)', () => {
  let server: StudioServer
  afterEach(async () => { await server?.close() })

  it('previews the snapped cell as the engine reads it, writes the region card the pick builds, and a real run binds the title', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder()
    const recipePath = join(folder, 'discounts.input.json')
    await post(server, { type: 'open-workspace', folder })
    const snapshot = await post<SnapshotView>(server, { type: 'take-snapshot', recipeId: 'discounts', path: 'start' })
    expect(snapshot.format).toBe('pdf')

    // 1. The canvas snaps to a cell: the title line, outside any table, by its own box off pdf-view.
    const view = await post<PdfDocumentView>(server, { type: 'pdf-view', recipeId: 'discounts', path: 'start' })
    const title = view.pages[0].rows.flatMap(row => row.cells).find(cell => cell.text.startsWith('DEALER DISCOUNTS'))
    if (title === undefined) throw new Error('the fixture lost its title line')
    const selector = regionSelector(1, title.x, title.y, title.x + title.width, title.y + title.height)

    // 2. The staged selection's preview: what the engine will read, and the cells to highlight.
    const preview = await post<RegionPreviewView>(server, { type: 'region-preview', recipeId: 'discounts', path: 'start', selector })
    expect(preview.error).toBeUndefined()
    expect(preview.matches).toEqual([{ page: 1, text: title.text, cells: [title] }])

    // 3. "Add to recipe": the region card the pick builds, appended to the outline and saved.
    const opened = await post<{ recipes: { id?: string, outline?: { steps: OutlineNode[] } & Record<string, unknown> }[] }>(server, { type: 'open-workspace', folder })
    const discounts = opened.recipes.find(recipe => recipe.id === 'discounts')
    if (discounts?.outline === undefined) throw new Error('expected the discounts recipe to have an outline')
    const regionCard: OutlineNode = { kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'title', kind: 'region', selector } }
    const emitCard: OutlineNode = { kind: 'card', path: 'steps.2', stepType: 'emit', sentence: [], custom: false, step: { type: 'emit' } }
    await post(server, { type: 'save-outline', path: recipePath, outline: { ...discounts.outline, steps: [...discounts.outline.steps, regionCard, emitCard] } })
    const saved = JSON.parse(readFileSync(recipePath, 'utf8')) as Record<string, unknown> & { steps: unknown[] }
    expect(saved.steps[1]).toEqual({ type: 'extract', id: 'title', kind: 'region', selector })

    // 4. A real run: the region binds the title, the mapping emits it.
    await post(server, { type: 'save-recipe', path: recipePath, recipe: { ...saved, mapping: { title: { from: 'title' } } } })
    const record = await runOneRecord(server, 'discounts')
    expect(record).toEqual({ title: title.text })
  }, 30000)
})
