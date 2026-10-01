import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { GridTablePreviewView, OutlineNode, SnapshotView, WorkbookDocumentView } from '../src/studio-api'

const LISTINO_FIXTURE = join(__dirname, '..', '..', 'core', 'src', 'workbook-document', 'fixtures', 'listino.csv')
const INCENTIVI_FIXTURE = join(__dirname, '..', '..', 'office-reader', 'src', 'spreadsheet', 'fixtures', 'incentivi.xlsx')

/** A fresh recipes folder with an api-mode recipe whose `start.url` is a `file://` URL to one of the repository's own workbook fixtures — `HttpClient` reads `file:` URLs the same way it reads a fetched response, no fixture HTTP server needed (mirrors `pdf-canvas.e2e.test.ts`'s own `recipesFolder`). */
/** The output fields the table picks below fill. */
const TABLE_FIELDS: Record<string, { type: string }> = { marca: { type: 'string' }, modello: { type: 'string' }, price: { type: 'number' } }

function recipesFolder (id: string, fixture: string, fields = TABLE_FIELDS): string {
  const folder = mkdtempSync(join(tmpdir(), `opencraw-e2e-grid-${id}-`))
  // Neither field is required: `listino.csv` has a continuation row with a blank "Marca"/"Modello" (the brand
  // written once, per `grid-table.algorithm.test.ts`), and a required-but-missing field would reject that whole
  // record instead of emitting it with a null (`map-record.use-case.ts`) — this suite counts records, so nothing
  // here is required.
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

// --- Local mirrors of `apps/studio-ui/src/content-pane/grid-pick.mapper.ts`'s pure functions: e2e tests drive the
// server directly (api-mode HTTP/WS, no real browser — same as `pdf-canvas.e2e.test.ts`/`document-tree.e2e.test.ts`'s
// own precedent), so the pick logic is reconstructed here rather than imported from `apps/studio-ui` (a different
// package/tsconfig this suite does not build against).

function escapedRowPattern (text: string): string {
  return `^${text.trim().replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}`
}

function sheetPattern (name: string): string {
  return `${escapedRowPattern(name)}$`
}

function rowPickText (cells: readonly (string | number | boolean)[]): string {
  return cells.map(cell => String(cell).trim()).filter(text => text !== '').join(' ')
}

function columnKeyFrom (headerText: string): string {
  const words = headerText.trim().toLowerCase().replaceAll(/[^\d a-z]/gi, ' ').trim().split(/\s+/).filter(word => word !== '')
  if (words.length === 0) return 'column'
  const [first, ...rest] = words

  return first + rest.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')
}

function filledGridOf (sheet: WorkbookDocumentView['sheets'][number]): (string | number | boolean)[][] {
  const grid: (string | number | boolean)[][] = sheet.rows.map(row => row.map(cell => cell.value))
  for (const merge of sheet.merges) {
    const value = grid[merge.top]?.[merge.left] ?? ''
    for (let row = merge.top; row <= merge.bottom; row += 1) {
      grid[row] ??= []
      for (let column = merge.left; column <= merge.right; column += 1) grid[row][column] = value
    }
  }

  return grid
}

function columnHeaderText (grid: readonly (readonly (string | number | boolean)[])[], headerRowIndexes: readonly number[], columnIndex: number): string {
  const parts: string[] = []
  for (const rowIndex of headerRowIndexes) {
    const text = String(grid[rowIndex]?.[columnIndex] ?? '').trim()
    if (text !== '' && !parts.includes(text)) parts.push(text)
  }

  return parts.join(' ')
}

describe('studio phase 5c: the grid canvas (#94)', () => {
  let server: StudioServer

  afterEach(async () => { await server?.close() })

  it('CSV: picks the sheet, header, until and columns off listino.csv, previews the matched rows live, and the resulting table card actually runs and returns the right rows', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder('listino', LISTINO_FIXTURE)
    const recipePath = join(folder, 'listino.input.json')

    await post(server, { type: 'open-workspace', folder })
    const snapshot = await post<SnapshotView>(server, { type: 'take-snapshot', recipeId: 'listino', path: 'start' })
    expect(snapshot.format).toBe('csv') // what the content pane uses to choose the grid canvas (issue #94's 5c)

    // --- 1. The grid canvas's sheets and cells, with the detected CSV delimiter/encoding ---
    const view = await post<WorkbookDocumentView>(server, { type: 'grid-view', recipeId: 'listino', path: 'start' })
    expect(view.sheets).toHaveLength(1)
    expect(view.csv).toEqual({ encoding: 'windows-1252', delimiter: ';' })
    const [sheet] = view.sheets
    expect(sheet.name).toBe('listino')

    // --- 2. Pick the sheet tab: an exact-name pattern (there is only ever one sheet in a CSV) ---
    const sheetOption = sheetPattern(sheet.name)
    expect(sheetOption).toBe('^listino$')

    // --- 3. Pick the header row: the row starting "Marca Modello" ---
    const headerRowIndex = sheet.rows.findIndex(row => row.map(cell => cell.value).join(' ').startsWith('Marca'))
    expect(headerRowIndex).toBeGreaterThanOrEqual(0)
    const header = escapedRowPattern(rowPickText(sheet.rows[headerRowIndex].map(cell => cell.value)))
    expect(header).toBe('^Marca Modello Versione Prezzo € Sconto %')

    // --- 4. Pick the first non-data row: "Totale" ---
    const untilRowIndex = sheet.rows.findIndex(row => String(row[0]?.value ?? '').startsWith('Totale'))
    expect(untilRowIndex).toBeGreaterThan(headerRowIndex)
    const until = escapedRowPattern(rowPickText(sheet.rows[untilRowIndex].map(cell => cell.value)))
    expect(until).toBe(String.raw`^Totale 73\.150,00`) // the row's own second cell (the sum) is part of its picked text too

    // --- 5. The live preview, off sheet+header+until: exactly the 4 data rows between them ---
    const preview = await post<GridTablePreviewView>(server, { type: 'grid-preview', recipeId: 'listino', path: 'start', options: { sheet: sheetOption, header, until } })
    expect(preview.error).toBeUndefined()
    expect(preview.matches).toHaveLength(1)
    const [match] = preview.matches
    expect(match.sheet).toBe('listino')
    expect(match.header).toEqual(['Marca', 'Modello', 'Versione', 'Prezzo €', 'Sconto %'])
    expect(match.rows).toHaveLength(4)

    // --- 6. Pick every column: its header cell's text names it in `columns` ---
    const columns = Object.fromEntries(match.header.map(name => [columnKeyFrom(name), escapedRowPattern(name)]))
    expect(columns).toEqual({ marca: '^Marca', modello: '^Modello', versione: '^Versione', prezzo: '^Prezzo €', sconto: '^Sconto %' })

    const namedPreview = await post<GridTablePreviewView>(server, { type: 'grid-preview', recipeId: 'listino', path: 'start', options: { sheet: sheetOption, header, until, columns } })
    expect(namedPreview.matches[0].rows[0]).toEqual({ marca: 'Fiat', modello: 'Pandina', versione: '1.0 Hybrid "Cross"', prezzo: '15.950,00', sconto: '12,5' })

    // --- 7. The picks write exactly the table card `grid-pick.mapper.ts`'s gridTableCardNode builds ---
    const opened = await post<{ recipes: { id?: string, outline?: { steps: OutlineNode[] } & Record<string, unknown> } [] }>(server, { type: 'open-workspace', folder })
    const listino = opened.recipes.find(recipe => recipe.id === 'listino')
    if (listino?.outline === undefined) throw new Error('expected the listino recipe to have an outline')
    const tableCard: OutlineNode = { kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'table', kind: 'table', selector: header, sheet: sheetOption, until, columns: { marca: columns.marca, modello: columns.modello, price: columns.prezzo } } }
    const setRowsCard: OutlineNode = { kind: 'card', path: 'steps.2', stepType: 'set', sentence: [], custom: false, step: { type: 'set', id: 'rows', value: '{{table.rows}}' } }
    const forEachRows: OutlineNode = { kind: 'bracket', path: 'steps.3', stepType: 'forEach', sentence: [], children: [], step: { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] } }
    await post(server, { type: 'save-outline', path: recipePath, outline: { ...listino.outline, steps: [...listino.outline.steps, tableCard, setRowsCard, forEachRows] } })

    const afterPick = JSON.parse(readFileSync(recipePath, 'utf8')) as { steps: unknown[] }
    expect(afterPick.steps[1]).toEqual({ type: 'extract', id: 'table', kind: 'table', selector: header, sheet: sheetOption, until, columns: { marca: columns.marca, modello: columns.modello, price: columns.prezzo } })

    // --- 8. A real run proves the table card is not just well-formed JSON, but a recipe that reads the right rows out of the fixture ---
    const afterPickRecipe = JSON.parse(readFileSync(recipePath, 'utf8')) as Record<string, unknown>
    const mapping = { marca: { from: 'row.marca' }, modello: { from: 'row.modello' }, price: { from: 'row.price' } } // the "price" output field's declared "number" type coerces "15.950,00" on its own (`coerce-field.mapper.ts`'s parseNumber guesses the European decimal comma unaided), no transform needed
    await post(server, { type: 'save-recipe', path: recipePath, recipe: { ...afterPickRecipe, mapping } })
    const records = await runRecords(server, 'listino', 4)
    expect(records).toHaveLength(4)
    expect(records[0]).toEqual({ marca: 'Fiat', modello: 'Pandina', price: 15_950 })
    expect(records[2]).toEqual({ marca: 'Citroën', modello: 'C3', price: 19_300 })
  }, 30000)

  it('CSV: overriding the delimiter/encoding on grid-view re-reads the file, and sticks for a following grid-preview', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder('listino2', LISTINO_FIXTURE)
    await post(server, { type: 'open-workspace', folder })
    await post(server, { type: 'take-snapshot', recipeId: 'listino2', path: 'start' })

    const detected = await post<WorkbookDocumentView>(server, { type: 'grid-view', recipeId: 'listino2', path: 'start' })
    expect(detected.csv).toEqual({ encoding: 'windows-1252', delimiter: ';' })

    // Forcing a `,` delimiter on a `;`-delimited file gives one ragged column per row instead.
    const forced = await post<WorkbookDocumentView>(server, { type: 'grid-view', recipeId: 'listino2', path: 'start', delimiter: ',' })
    expect(forced.csv?.delimiter).toBe(',')
    expect(forced.sheets[0].rows[0]).toHaveLength(1)

    // The override sticks: a following grid-view with none given still answers the overridden reading.
    const again = await post<WorkbookDocumentView>(server, { type: 'grid-view', recipeId: 'listino2', path: 'start' })
    expect(again.csv?.delimiter).toBe(',')
  })

  it('XLSX: picks the sheet (hidden sheets marked), a two-row header, the boundary row, columns and a merged-group\'s fillDown off incentivi.xlsx, and the resulting table card runs and returns the right rows', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder('incentivi', INCENTIVI_FIXTURE)
    const recipePath = join(folder, 'incentivi.input.json')

    await post(server, { type: 'open-workspace', folder })
    const snapshot = await post<SnapshotView>(server, { type: 'take-snapshot', recipeId: 'incentivi', path: 'start' })
    expect(snapshot.format).toBe('xlsx')

    // --- 1. Sheet tabs: hidden sheets marked ---
    const view = await post<WorkbookDocumentView>(server, { type: 'grid-view', recipeId: 'incentivi', path: 'start' })
    expect(view.sheets.map(candidate => [candidate.name, candidate.hidden])).toEqual([['Incentivi giugno', false], ['Archivio', true], ['Maggio', false]])
    const [sheet] = view.sheets
    expect(sheet.hiddenRows).toEqual([6]) // a hidden row, marked
    expect(sheet.merges.map(merge => merge.ref)).toEqual(['A1:H1', 'A3:A4', 'B3:B4', 'C3:D3', 'E3:E4', 'F3:F4', 'A5:A6'])

    // --- 2. Pick the sheet tab ---
    const sheetOption = sheetPattern(sheet.name)
    expect(sheetOption).toBe('^Incentivi giugno$')

    // --- 3. Pick the header row (index 2: "Marca Modello Prezzo Sconto Valido dal Attivo Nota" — the merged-away blank cell contributes no text)… ---
    const headerRowIndex = sheet.rows.findIndex(row => rowPickText(row.map(cell => cell.value)).startsWith('Marca Modello Prezzo'))
    expect(headerRowIndex).toBe(2)
    const header = escapedRowPattern(rowPickText(sheet.rows[headerRowIndex].map(cell => cell.value)))
    expect(header).toBe('^Marca Modello Prezzo Sconto Valido dal Attivo Nota')
    // …then extend it to the sub-header row right below (row 3: "Listino"/"Netto" under the merged "Prezzo" group) — two header rows.
    const headerRows = 2
    const headerRowIndexes = [headerRowIndex, headerRowIndex + 1]

    // --- 4. Pick the first row that is not data: "Consegna", after the hidden row and the ragged "Jeep" row ---
    const untilRowIndex = sheet.rows.findIndex((row, index) => index > headerRowIndex + headerRows && String(row[0]?.value ?? '') === 'Consegna')
    expect(untilRowIndex).toBe(8)
    const until = escapedRowPattern(rowPickText(sheet.rows[untilRowIndex].map(cell => cell.value)))

    // --- 5. Pick three columns, reading each one's header text off the merge-filled grid across both header rows ---
    const grid = filledGridOf(sheet)
    const marcaText = columnHeaderText(grid, headerRowIndexes, 0)
    const modelloText = columnHeaderText(grid, headerRowIndexes, 1)
    const nettoText = columnHeaderText(grid, headerRowIndexes, 3)
    expect([marcaText, modelloText, nettoText]).toEqual(['Marca', 'Modello', 'Prezzo Netto'])
    const columns = { marca: escapedRowPattern(marcaText), modello: escapedRowPattern(modelloText), price: escapedRowPattern(nettoText) }

    // --- 6. Pick the merged-group label at A5:A6 (the "Fiat" brand written once, covering the "Pandina"/"Pandina Cross" rows): fillDown ---
    const brandMerge = sheet.merges.find(merge => merge.left === merge.right && merge.bottom > merge.top && merge.left === 0 && merge.top >= headerRowIndex + headerRows)
    expect(brandMerge).toBeDefined() // A5:A6, 0-based rows 4-5
    const fillDownKey = 'marca' // this exact header text ("Marca") was already picked as a named column above (`grid-pick.mapper.ts`'s `fillDownKeyFor`)
    const fillDown = [fillDownKey]

    // --- 7. The live preview, off the full picks: exactly the 3 visible body rows (the hidden "secret" row excluded) ---
    const preview = await post<GridTablePreviewView>(server, { type: 'grid-preview', recipeId: 'incentivi', path: 'start', options: { sheet: sheetOption, header, until, headerRows, columns, fillDown } })
    expect(preview.error).toBeUndefined()
    expect(preview.matches).toHaveLength(1)
    const [match] = preview.matches
    expect(match.rows).toEqual([
      { marca: 'Fiat', modello: 'Pandina', price: 13_955.625 },
      { marca: 'Fiat', modello: 'Pandina Cross', price: 15_706.25 }, // filled from the row above by the Excel merge itself, same value fillDown would also give
      { marca: 'Jeep', modello: 'Avenger', price: '' }, // the ragged Jeep row has no Prezzo/Netto cell at all
    ])

    // --- 8. The picks write exactly the table card `grid-pick.mapper.ts`'s gridTableCardNode builds ---
    const opened = await post<{ recipes: { id?: string, outline?: { steps: OutlineNode[] } & Record<string, unknown> } [] }>(server, { type: 'open-workspace', folder })
    const incentivi = opened.recipes.find(recipe => recipe.id === 'incentivi')
    if (incentivi?.outline === undefined) throw new Error('expected the incentivi recipe to have an outline')
    const tableCard: OutlineNode = { kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'table', kind: 'table', selector: header, sheet: sheetOption, until, headerRows, columns, fillDown } }
    const setRowsCard: OutlineNode = { kind: 'card', path: 'steps.2', stepType: 'set', sentence: [], custom: false, step: { type: 'set', id: 'rows', value: '{{table.rows}}' } }
    const forEachRows: OutlineNode = { kind: 'bracket', path: 'steps.3', stepType: 'forEach', sentence: [], children: [], step: { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] } }
    await post(server, { type: 'save-outline', path: recipePath, outline: { ...incentivi.outline, steps: [...incentivi.outline.steps, tableCard, setRowsCard, forEachRows] } })

    // --- 9. A real run proves the table card reads the right rows out of the fixture ---
    const afterPickRecipe = JSON.parse(readFileSync(recipePath, 'utf8')) as Record<string, unknown>
    const mapping = { marca: { from: 'row.marca' }, modello: { from: 'row.modello' }, price: { from: 'row.price' } }
    await post(server, { type: 'save-recipe', path: recipePath, recipe: { ...afterPickRecipe, mapping } })
    const records = await runRecords(server, 'incentivi', 3)
    expect(records).toHaveLength(3)
    expect(records[0]).toEqual({ marca: 'Fiat', modello: 'Pandina', price: 13_955.625 })
    expect(records[1]).toEqual({ marca: 'Fiat', modello: 'Pandina Cross', price: 15_706.25 })
    expect(records[2]).toEqual({ marca: 'Jeep', modello: 'Avenger', price: null }) // the missing-value policy on a non-required, non-key field
  }, 30000)
})

/** Mirrors `apps/studio-ui/src/content-pane/grid-pick.mapper.ts`'s `cellSelector`: the sheet by name, the cell (or the slice of rows then of columns) by position. */
function cellSelector (sheetName: string, top: number, left: number, bottom = top, right = left): string {
  const rows = top === bottom ? `[${String(top)}]` : `[${String(top)}:${String(bottom + 1)}]`
  const columns = left === right ? `[${String(left)}]` : `[${String(left)}:${String(right + 1)}]`

  return `$.sheets[?(@.name=='${sheetName}')].rows${rows}${columns}`
}

describe('clicking a cell on the grid canvas: a jsonpath extract (#123)', () => {
  let server: StudioServer
  afterEach(async () => { await server?.close() })

  it('writes the cell card the pick builds, and a real run binds the title cell and a rectangle of cells', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder('listino', LISTINO_FIXTURE, { title: { type: 'string' }, header: { type: 'json' } })
    const recipePath = join(folder, 'listino.input.json')
    await post(server, { type: 'open-workspace', folder })
    await post(server, { type: 'take-snapshot', recipeId: 'listino', path: 'start' })

    // 1. The canvas lights up a cell off grid-view: the title line in A1, and the header row's first three cells.
    const view = await post<WorkbookDocumentView>(server, { type: 'grid-view', recipeId: 'listino', path: 'start' })
    const [sheet] = view.sheets
    const title = String(sheet.rows[0][0].value)
    expect(title).toMatch(/^Listino prezzi/)
    const headerRowIndex = sheet.rows.findIndex(row => String(row[0]?.value).startsWith('Marca'))
    const titleSelector = cellSelector(sheet.name, 0, 0)
    const headerSelector = cellSelector(sheet.name, headerRowIndex, 0, headerRowIndex, 2)
    expect(titleSelector).toBe("$.sheets[?(@.name=='listino')].rows[0][0]")

    // 2. "Add to recipe": the jsonpath cards the picks build (`gridCellCardNode`), appended to the outline and saved.
    const opened = await post<{ recipes: { id?: string, outline?: { steps: OutlineNode[] } & Record<string, unknown> }[] }>(server, { type: 'open-workspace', folder })
    const listino = opened.recipes.find(recipe => recipe.id === 'listino')
    if (listino?.outline === undefined) throw new Error('expected the listino recipe to have an outline')
    const titleCard: OutlineNode = { kind: 'card', path: 'steps.1', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'title', kind: 'jsonpath', selector: titleSelector, take: 'json' } }
    const headerCard: OutlineNode = { kind: 'card', path: 'steps.2', stepType: 'extract', sentence: [], custom: false, step: { type: 'extract', id: 'header', kind: 'jsonpath', selector: headerSelector, take: 'json', many: true } }
    const emitCard: OutlineNode = { kind: 'card', path: 'steps.3', stepType: 'emit', sentence: [], custom: false, step: { type: 'emit' } }
    await post(server, { type: 'save-outline', path: recipePath, outline: { ...listino.outline, steps: [...listino.outline.steps, titleCard, headerCard, emitCard] } })
    const saved = JSON.parse(readFileSync(recipePath, 'utf8')) as Record<string, unknown> & { steps: unknown[] }
    expect(saved.steps[1]).toEqual({ type: 'extract', id: 'title', kind: 'jsonpath', selector: titleSelector, take: 'json' })

    // 3. A real run: the engine reads the same cells the canvas showed.
    await post(server, { type: 'save-recipe', path: recipePath, recipe: { ...saved, mapping: { title: { from: 'title' }, header: { from: 'header' } } } })
    const [record] = await runRecords(server, 'listino', 1)
    expect(record).toEqual({ title, header: ['Marca', 'Modello', 'Versione'] })
  }, 30000)
})
