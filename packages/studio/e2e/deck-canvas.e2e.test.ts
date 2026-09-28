import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { DeckDocumentView, DeckTablePreviewView, OutlineNode, SnapshotView } from '../src/studio-api'

/** The DfE college accounts deck (examples/): native tables (issue #94's 5d — "Loan Covenant Compliance", no merges, a clean single header row) and a real chartEx chart (a waterfall, "Income and Expenditure Bridge") — confirms chartEx support (#82) reaches the deck canvas end to end, not just office-reader's own unit tests. */
const DFE_FIXTURE = join(__dirname, '..', '..', '..', 'examples', 'dfe-college-accounts', 'management-accounts-model-march-2026.pptx')
/** `@opencraw/office-reader`'s own presentation fixture: a text-box grid on slide 2 ("Griglia prezzi Jeep" — Modello/Prezzo/Sconto), for the `shapes: true` pick. */
const INCENTIVI_FIXTURE = join(__dirname, '..', '..', 'office-reader', 'src', 'presentation', 'fixtures', 'incentivi.pptx')

/** A fresh recipes folder with an api-mode recipe whose `start.url` is a `file://` URL to a `.pptx` fixture — `HttpClient` reads `file:` URLs the same way it reads a fetched response, no fixture HTTP server needed (mirrors `pdf-canvas.e2e.test.ts`'s own `recipesFolder`). */
function recipesFolder (id: string, fixture: string, fields: Record<string, { type: string }>): string {
  const folder = mkdtempSync(join(tmpdir(), `opencraw-e2e-deck-${id}-`))
  writeFileSync(join(folder, `${id}.output.json`), JSON.stringify({ kind: 'output', id, version: 1, fields }))
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

/** Runs a sample over the event socket and resolves with every emitted record — mirrors `pdf-canvas.e2e.test.ts`'s own `runRecords`. */
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

// --- Local mirrors of `apps/studio-ui/src/content-pane/deck-pick.mapper.ts`'s pure functions: e2e tests drive the
// server directly (api-mode HTTP/WS, no real browser — same as `pdf-canvas.e2e.test.ts`/`grid-canvas.e2e.test.ts`'s
// own precedent), so the pick logic is reconstructed here rather than imported from `apps/studio-ui` (a different
// package/tsconfig this suite does not build against).

function escapedRowPattern (text: string): string {
  return `^${text.trim().replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}`
}

function slidePattern (title: string): string {
  return `${escapedRowPattern(title)}$`
}

function rowPickText (cells: readonly (string | number | boolean)[]): string {
  return cells.map(cell => String(cell).trim()).filter(text => text !== '').join(' ')
}

describe('studio phase 5d: the deck canvas (#94)', () => {
  let server: StudioServer

  afterEach(async () => { await server?.close() })

  it('picks a slide\'s native table (slide, header, columns), previews its matched rows live, and the resulting table card actually runs and returns the right rows', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder('dfe-table', DFE_FIXTURE, { risk: { type: 'string' }, met: { type: 'string' } })
    const recipePath = join(folder, 'dfe-table.input.json')

    await post(server, { type: 'open-workspace', folder })
    const snapshot = await post<SnapshotView>(server, { type: 'take-snapshot', recipeId: 'dfe-table', path: 'start' })
    expect(snapshot.format).toBe('pptx') // what the content pane uses to choose the deck canvas (issue #94's 5d)

    // --- 1. The deck canvas's slides: shapes, native tables, charts and notes ---
    const view = await post<DeckDocumentView>(server, { type: 'deck-view', recipeId: 'dfe-table', path: 'start' })
    expect(view.slides.length).toBeGreaterThan(10)
    const slideIndex = view.slides.findIndex(slide => slide.title === 'Loan Covenant Compliance')
    expect(slideIndex).toBeGreaterThanOrEqual(0)
    const slide = view.slides[slideIndex]
    expect(slide.tables).toHaveLength(1)
    const [table] = slide.tables
    expect(table.rows).toHaveLength(4) // 1 header row + 3 data rows

    // --- 2. Pick the slide: an exact-title pattern, scoping the table read to it ---
    const slideOption = slidePattern(slide.title as string)
    expect(slideOption).toBe('^Loan Covenant Compliance$')

    // --- 3. Pick the header row (the table's first and only row) ---
    const headerRowIndex = 0
    const header = escapedRowPattern(rowPickText(table.rows[headerRowIndex].map(cell => cell.value)))
    expect(header).toBe(String.raw`^Not Forecast \(full year\) Budget \(full year\) Covenant Met\? Head room`)

    // --- 4. The live preview, off slide+header: the 3 body rows ---
    const preview = await post<DeckTablePreviewView>(server, { type: 'deck-preview', recipeId: 'dfe-table', path: 'start', options: { slide: slideOption, header } })
    expect(preview.error).toBeUndefined()
    expect(preview.matches).toHaveLength(1)
    const [match] = preview.matches
    expect(match.slide).toBe(slide.number)
    expect(match.slideTitle).toBe('Loan Covenant Compliance')
    expect(match.header).toEqual(['Not', 'Forecast (full year)', 'Budget (full year)', 'Covenant Met?', 'Head room'])
    expect(match.rows).toHaveLength(3)

    // --- 5. Pick two columns: their header cells' text names them in `columns` ---
    const columns = { risk: escapedRowPattern('Not'), met: escapedRowPattern('Covenant Met?') }
    expect(columns).toEqual({ risk: '^Not', met: String.raw`^Covenant Met\?` })

    const namedPreview = await post<DeckTablePreviewView>(server, { type: 'deck-preview', recipeId: 'dfe-table', path: 'start', options: { slide: slideOption, header, columns } })
    expect(namedPreview.matches[0].rows[0]).toEqual({ risk: 'Debt service cover > 1.25', met: 'NO' })

    // --- 6. The picks write exactly the table card `deck-pick.mapper.ts`'s deckTableCardNode builds ---
    const opened = await post<{ recipes: { id?: string, outline?: { steps: OutlineNode[] } & Record<string, unknown> } [] }>(server, { type: 'open-workspace', folder })
    const recipe = opened.recipes.find(candidate => candidate.id === 'dfe-table')
    if (recipe?.outline === undefined) throw new Error('expected the dfe-table recipe to have an outline')
    const tableCard: OutlineNode = { kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'table', kind: 'table', selector: header, slide: slideOption, columns } }
    const setRowsCard: OutlineNode = { kind: 'card', path: 'steps.2', stepType: 'set', sentence: [], custom: false, step: { type: 'set', id: 'rows', value: '{{table.rows}}' } }
    const forEachRows: OutlineNode = { kind: 'bracket', path: 'steps.3', stepType: 'forEach', sentence: [], children: [], step: { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] } }
    await post(server, { type: 'save-outline', path: recipePath, outline: { ...recipe.outline, steps: [...recipe.outline.steps, tableCard, setRowsCard, forEachRows] } })

    const afterPick = JSON.parse(readFileSync(recipePath, 'utf8')) as { steps: unknown[] }
    expect(afterPick.steps[1]).toEqual({ type: 'extract', id: 'table', kind: 'table', selector: header, slide: slideOption, columns })

    // --- 7. A real run proves the table card is not just well-formed JSON, but a recipe that reads the right rows out of the fixture ---
    const afterPickRecipe = JSON.parse(readFileSync(recipePath, 'utf8')) as Record<string, unknown>
    const mapping = { risk: { from: 'row.risk' }, met: { from: 'row.met' } }
    await post(server, { type: 'save-recipe', path: recipePath, recipe: { ...afterPickRecipe, mapping } })
    const records = await runRecords(server, 'dfe-table', 3)
    expect(records).toEqual([
      { risk: 'Debt service cover > 1.25', met: 'NO' },
      { risk: 'Net borrowings: EBITDA < 7.0', met: 'NO' },
      { risk: 'Net Assets (excluding pension liability) >0', met: 'YES' },
    ])
  }, 30000)

  it('picks a chart (a real chartEx waterfall, confirming #82 reaches the deck canvas): the jsonpath card addresses its own series, and running it reads the real series back', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder('dfe-chart', DFE_FIXTURE, { name: { type: 'string' } })
    const recipePath = join(folder, 'dfe-chart.input.json')

    await post(server, { type: 'open-workspace', folder })
    await post(server, { type: 'take-snapshot', recipeId: 'dfe-chart', path: 'start' })

    // --- 1. The chart is read as chartEx: a waterfall, its title, and its series' categories/values ---
    const view = await post<DeckDocumentView>(server, { type: 'deck-view', recipeId: 'dfe-chart', path: 'start' })
    const slideIndex = view.slides.findIndex(slide => slide.charts.length > 0 && slide.charts[0].type === 'waterfall')
    expect(slideIndex).toBeGreaterThanOrEqual(0)
    const slide = view.slides[slideIndex]
    expect(slide.title).toBe('Income and Expenditure Bridge')
    const [chart] = slide.charts
    expect(chart).toMatchObject({ type: 'waterfall', title: 'Income and Expenditure Forecast Variance to Budget (£’000)' })
    expect(chart.series).toEqual([{
      name:       'Series1',
      categories: ['Budget', 'ASF', 'Apps', 'HE', 'Other income', 'Pay', 'Non pay', 'Other   ', 'Forecast'],
      values:     [-20, -139, -56, -92, -69, 216, -110, 8, -262],
    }])

    // --- 2. The chart pick writes exactly the jsonpath card `deck-pick.mapper.ts`'s deckChartCardNode builds ---
    const chartIndex = 0
    const selector = `$.slides[${String(slideIndex)}].charts[${String(chartIndex)}].series`
    expect(selector).toBe('$.slides[8].charts[0].series')
    const opened = await post<{ recipes: { id?: string, outline?: { steps: OutlineNode[] } & Record<string, unknown> } [] }>(server, { type: 'open-workspace', folder })
    const recipe = opened.recipes.find(candidate => candidate.id === 'dfe-chart')
    if (recipe?.outline === undefined) throw new Error('expected the dfe-chart recipe to have an outline')
    const chartCard: OutlineNode = { kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'value', kind: 'jsonpath', selector, take: 'json' } }
    // Reads the series array; the studio's own Steps outline lets a person add a forEach over it afterwards, the same as the DOM picker's own Read card — "series.name" reads the bound alias's own property, the same dot-path the mapping already understands for a table row's fields (see pdf/grid-canvas.e2e.test.ts's own "row.model").
    const forEachSeries: OutlineNode = { kind: 'bracket', path: 'steps.2', stepType: 'forEach', sentence: [], children: [], step: { type: 'forEach', over: 'value', as: 'series', emit: true, steps: [] } }
    await post(server, { type: 'save-outline', path: recipePath, outline: { ...recipe.outline, steps: [...recipe.outline.steps, chartCard, forEachSeries] } })

    const afterPick = JSON.parse(readFileSync(recipePath, 'utf8')) as { steps: unknown[] }
    expect(afterPick.steps[1]).toEqual({ type: 'extract', id: 'value', kind: 'jsonpath', selector, take: 'json' })

    // --- 3. A real run proves the jsonpath card resolves for real: one record per series (here, one), its name read back ---
    const afterPickRecipe = JSON.parse(readFileSync(recipePath, 'utf8')) as Record<string, unknown>
    await post(server, { type: 'save-recipe', path: recipePath, recipe: { ...afterPickRecipe, mapping: { name: { from: 'series.name' } } } })
    const records = await runRecords(server, 'dfe-chart', 1)
    expect(records).toEqual([{ name: 'Series1' }])
  }, 30000)

  it('reads text boxes laid out as a table with "shapes: true": the header row\'s pick, previewed live, matches the same rows findDeckTables would', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder('incentivi-shapes', INCENTIVI_FIXTURE, { model: { type: 'string' }, price: { type: 'string' } })

    await post(server, { type: 'open-workspace', folder })
    await post(server, { type: 'take-snapshot', recipeId: 'incentivi-shapes', path: 'start' })

    const view = await post<DeckDocumentView>(server, { type: 'deck-view', recipeId: 'incentivi-shapes', path: 'start' })
    const slideIndex = view.slides.findIndex(slide => slide.title === 'Griglia prezzi Jeep')
    expect(slideIndex).toBeGreaterThanOrEqual(0)
    const slide = view.slides[slideIndex]

    // --- The header row: the three shapes reading "Modello"/"Prezzo"/"Sconto", grouped by shapeRows ---
    const headerShapeIndex = slide.shapes.findIndex(shape => shape.text === 'Modello')
    expect(headerShapeIndex).toBeGreaterThanOrEqual(0)
    const headerRow = slide.shapeRows.find(row => row.includes(headerShapeIndex))
    expect(headerRow).toBeDefined()
    const leftmostText = slide.shapes[(headerRow as number[])[0]].text
    expect(leftmostText).toBe('Modello') // "Modello" is already the row's own leftmost shape
    const header = escapedRowPattern(leftmostText)
    const columns = { model: escapedRowPattern('Modello'), price: escapedRowPattern('Prezzo') }

    const preview = await post<DeckTablePreviewView>(server, { type: 'deck-preview', recipeId: 'incentivi-shapes', path: 'start', options: { shapes: true, header, columns } })
    expect(preview.error).toBeUndefined()
    expect(preview.matches).toHaveLength(1)
    const [match] = preview.matches
    expect(match.slide).toBe(slide.number)
    expect(match.header).toEqual(['Modello', 'Prezzo', 'Sconto'])
    expect(match.rows).toEqual([
      { model: 'Avenger', price: '24.950 €' },
      { model: 'Compass', price: '39.900 €' },
    ])
  })
})
