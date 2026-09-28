import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { OutlineNode, PdfDocumentView, SnapshotView, TablePreviewView } from '../src/studio-api'

const DISCOUNTS_FIXTURE = join(__dirname, '..', '..', 'core', 'src', 'pdf-document', 'fixtures', 'discounts.pdf')

/**
 * A fresh recipes folder with an api-mode recipe whose `start.url` is a
 * `file://` URL to `@opencraw/core`'s own PDF fixture — `HttpClient` reads
 * `file:` URLs the same way it reads a fetched response, no fixture HTTP
 * server needed (mirrors `document-tree.e2e.test.ts`'s own `recipesFolder`).
 */
function recipesFolder (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-pdf-'))
  writeFileSync(join(folder, 'discounts.output.json'), JSON.stringify({
    kind:    'output',
    id:      'discounts',
    version: 1,
    fields:  {
      model:    { type: 'string', required: true, key: true },
      discount: { type: 'string' },
      excluded: { type: 'string' },
      extra:    { type: 'string' },
    },
  }))
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

/** Runs a sample over the event socket and resolves with every emitted record — mirrors `document-tree.e2e.test.ts`'s `runOneRecord`, extended to collect more than one. */
async function runRecords (server: StudioServer, recipeId: string, maxRecords: number): Promise<Record<string, unknown>[]> {
  const socket = new WebSocket(`ws://127.0.0.1:${new URL(server.url).port}/ws?token=${server.token}`)
  const traceLines: string[] = []
  const records: Record<string, unknown>[] = []
  let finishedError: string | undefined
  let finished = false
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { type: string, data?: Record<string, unknown>, error?: string, line?: string }
    if (message.type === 'trace-line' && message.line !== undefined) traceLines.push(message.line)
    if (message.type === 'record' && message.data !== undefined) records.push(message.data)
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
  await post(server, { type: 'run-sample', recipeId, budget: { maxRecords } })
  try {
    await done

    return records
  } finally {
    socket.close()
  }
}

/** Mirrors `apps/studio-ui/src/content-pane/pdf-pick.mapper.ts`'s `escapedRowPattern`: anchors the text at its start, escaping regex metacharacters. */
function escapedRowPattern (text: string): string {
  return `^${text.trim().replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}`
}

/** Mirrors `pdf-pick.mapper.ts`'s `columnKeyFrom`: a lowerCamelCase, ASCII-only id from a band's header text. */
function columnKeyFrom (headerText: string): string {
  const words = headerText.trim().toLowerCase().replaceAll(/[^\d a-z]/gi, ' ').trim().split(/\s+/).filter(word => word !== '')
  if (words.length === 0) return 'column'
  const [first, ...rest] = words

  return first + rest.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')
}

describe('studio phase 5b: the PDF canvas (#94)', () => {
  let server: StudioServer

  afterEach(async () => { await server?.close() })

  it('picks the header row and the last (boundary) row of a table, previews its matched rows live, picks its column bands, and the resulting table card actually runs and returns the right rows', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder()
    const recipePath = join(folder, 'discounts.input.json')

    await post(server, { type: 'open-workspace', folder })
    const snapshot = await post<SnapshotView>(server, { type: 'take-snapshot', recipeId: 'discounts', path: 'start' })
    expect(snapshot.format).toBe('pdf') // what the content pane uses to choose the PDF canvas (issue #94's 5b)

    // --- 1. The PDF canvas's geometry: every cell readPdf found, per page ---
    const view = await post<PdfDocumentView>(server, { type: 'pdf-view', recipeId: 'discounts', path: 'start' })
    expect(view.pages).toHaveLength(2)
    const [page] = view.pages
    expect(page.hasTextLayer).toBe(true)
    expect(page.cellCount).toBeGreaterThan(0)

    // --- 2. Pick the header row: the row whose first cell reads "MODELS ALPHA" ---
    const headerRowIndex = page.rows.findIndex(row => row.cells[0]?.text === 'MODELS ALPHA')
    expect(headerRowIndex).toBeGreaterThanOrEqual(0)
    const header = escapedRowPattern(page.rows[headerRowIndex].cells[0].text)
    expect(header).toBe('^MODELS ALPHA')

    // --- 3. Pick the last (boundary) row: the "NOTE" row that ends this table ---
    const untilRowIndex = page.rows.findIndex(row => row.cells[0]?.text.startsWith('NOTE') === true)
    expect(untilRowIndex).toBeGreaterThan(headerRowIndex)
    const until = escapedRowPattern(page.rows[untilRowIndex].cells[0].text)
    expect(until).toMatch(/^\^NOTE/)

    // --- 4. The live preview, off just header+until: the matched rows highlighted, and the column bands to pick from ---
    const preview = await post<TablePreviewView>(server, { type: 'table-preview', recipeId: 'discounts', path: 'start', options: { header, until } })
    expect(preview.error).toBeUndefined()
    expect(preview.matches).toHaveLength(1)
    const [match] = preview.matches
    expect(match.page).toBe(1)
    expect(match.headerRowIndex).toBe(headerRowIndex)
    expect(match.table.rows).toHaveLength(6) // MODELS ALPHA has 6 rows (packages/core/src/pdf-document/pdf-table.algorithm.test.ts)
    expect(match.matchedRowIndices).toContain(headerRowIndex)
    expect(match.matchedRowIndices).toContain(untilRowIndex)
    expect(match.bands.map(band => band.name)).toEqual(['MODELS ALPHA', 'Discount %*', 'Excluded versions', 'Extra *'])

    // --- 5. Pick every column band: its name becomes columns[key] ---
    const columns = Object.fromEntries(match.bands.map(band => [columnKeyFrom(band.name), escapedRowPattern(band.name)]))
    expect(columns).toEqual({ modelsAlpha: '^MODELS ALPHA', discount: String.raw`^Discount %\*`, excludedVersions: '^Excluded versions', extra: String.raw`^Extra \*` })
    // The Record tab renames a picked column id like any other (mirrors outline-from-pick.mapper.ts's own "value" convention) — this test uses the engine's own fixture names so the mapping below reads naturally.
    const namedColumns = { model: columns.modelsAlpha, discount: columns.discount, excluded: columns.excludedVersions, extra: columns.extra }

    // The full options (header, until, every column) still preview the same 6 rows, now named.
    const namedPreview = await post<TablePreviewView>(server, { type: 'table-preview', recipeId: 'discounts', path: 'start', options: { header, until, columns: namedColumns } })
    expect(namedPreview.matches[0].table.rows[0]).toEqual({ model: 'CITY (model 101)', discount: '19,0%', excluded: '', extra: '+3% registration bonus' })

    // --- 6. The picks write exactly the table card `pdf-pick.mapper.ts`'s tableCardNode builds (proven here from the server side, same as document-tree.e2e.test.ts/picking.e2e.test.ts do for the other canvases) ---
    const opened = await post<{ recipes: { id?: string, outline?: { steps: OutlineNode[] } & Record<string, unknown> } [] }>(server, { type: 'open-workspace', folder })
    const discounts = opened.recipes.find(recipe => recipe.id === 'discounts')
    if (discounts?.outline === undefined) throw new Error('expected the discounts recipe to have an outline')
    const tableCard: OutlineNode = { kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'table', kind: 'table', selector: header, until, columns: namedColumns } }
    const setRowsCard: OutlineNode = { kind: 'card', path: 'steps.2', stepType: 'set', sentence: [], custom: false, step: { type: 'set', id: 'rows', value: '{{table.rows}}' } }
    const forEachRows: OutlineNode = { kind: 'bracket', path: 'steps.3', stepType: 'forEach', sentence: [], children: [], step: { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] } }
    await post(server, { type: 'save-outline', path: recipePath, outline: { ...discounts.outline, steps: [...discounts.outline.steps, tableCard, setRowsCard, forEachRows] } })

    const afterPick = JSON.parse(readFileSync(recipePath, 'utf8')) as { steps: unknown[] }
    expect(afterPick.steps).toEqual([
      { type: 'request', id: 'doc', url: '{{start.url}}' },
      { type: 'extract', id: 'table', kind: 'table', selector: '^MODELS ALPHA', until, columns: namedColumns },
      { type: 'set', id: 'rows', value: '{{table.rows}}' },
      { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] },
    ])

    // --- 7. A real run proves the table card is not just well-formed JSON, but a recipe that reads the right 6 rows out of the fixture ---
    const afterPickRecipe = JSON.parse(readFileSync(recipePath, 'utf8')) as Record<string, unknown>
    const mapping = { model: { from: 'row.model' }, discount: { from: 'row.discount' }, excluded: { from: 'row.excluded' }, extra: { from: 'row.extra' } }
    await post(server, { type: 'save-recipe', path: recipePath, recipe: { ...afterPickRecipe, mapping } })
    const records = await runRecords(server, 'discounts', 6)
    expect(records).toHaveLength(6)
    // An empty cell binds an empty string (`readTables` always fills every column key); the mapping has no `default`
    // transform (unlike the guide's own `fixture-tables.input.json`), so the engine's own missing-value policy turns
    // that empty string into `null` for the non-required fields — the exact same values discussed in
    // `packages/core/src/pdf-document/pdf-table.algorithm.test.ts`, just written out through a real record-sink run.
    expect(records.slice(0, 3)).toEqual([
      { model: 'CITY (model 101)', discount: '19,0%', excluded: null, extra: '+3% registration bonus' },
      { model: 'CITY EV (model 102)', discount: '3,0%', excluded: null, extra: null },
      { model: 'MINI (model 103)', discount: '0,0%', excluded: null, extra: '1000 euro scrappage bonus' },
    ])
    expect(records[3]).toEqual({ model: 'SEDAN (model 104)', discount: '16,0%', excluded: 'Special 100 edition 104.8RU-Top Sport 104.LRU', extra: null })
    expect(records[5]).toEqual({ model: 'COUPE (model 105)', discount: '11,0%', excluded: null, extra: null })
  }, 30000)

  it('says a snapshot with no cells is not a text layer to read, instead of pretending the page is empty of tables', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-pdf-scan-'))
    const scanFixture = join(__dirname, '..', '..', 'core', 'src', 'pdf-document', 'fixtures', 'scanned.pdf')
    writeFileSync(join(folder, 'scan.output.json'), JSON.stringify({ kind: 'output', id: 'scan', version: 1, fields: { x: { type: 'string' } } }))
    writeFileSync(join(folder, 'scan.input.json'), JSON.stringify({
      kind: 'input', id: 'scan', output: 'scan', mode: 'api', start: [{ url: pathToFileURL(scanFixture).href }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}' }], mapping: {},
    }))
    await post(server, { type: 'open-workspace', folder })

    await expect(post(server, { type: 'take-snapshot', recipeId: 'scan', path: 'start' })).rejects.toThrow(/no page has a text layer/)
  })
})
