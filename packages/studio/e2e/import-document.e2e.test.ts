import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { ImportDocumentView, RecipeListing, SnapshotView, WorkspaceView } from '../src/studio-api'

const DISCOUNTS_FIXTURE = join(__dirname, '..', '..', 'core', 'src', 'pdf-document', 'fixtures', 'discounts.pdf')

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
    const summary = JSON.stringify({ ...(body as object), bytes: '…' }) // the base64 of a whole PDF is no help in a failure message
    const text = await response.text()
    throw new Error(`${response.status} on ${summary}: ${text}`)
  }

  return response.json() as Promise<T>
}

/** Exactly what `apps/studio-ui`'s `documentRecipeFiles` writes for a dropped file: an api recipe reading the copy by its `file:` URL. */
function documentPair (id: string, url: string): { output: Record<string, unknown>, input: Record<string, unknown> } {
  return {
    output: { kind: 'output', id, version: 1, fields: {} },
    input:  { kind: 'input', id, output: id, mode: 'api', start: [{ url }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}' }], mapping: {} },
  }
}

describe('starting a recipe from a dropped document (#120)', () => {
  let server: StudioServer
  afterEach(async () => { await server?.close() })

  it('copies the file into a folder that does not exist yet, lists the saved pair clean, and snapshots the copy as a PDF for the content pane', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const parent = mkdtempSync(join(tmpdir(), 'opencraw-e2e-import-'))
    const folder = join(parent, 'new-workspace')
    expect(existsSync(folder)).toBe(false)

    // 1. The drop: the bytes go up base64-encoded, the copy lands in the (now created) folder.
    const bytes = readFileSync(DISCOUNTS_FIXTURE)
    const imported = await post<ImportDocumentView>(server, { type: 'import-document', folder, name: 'discounts.pdf', bytes: bytes.toString('base64') })
    expect(imported.path).toBe(join(folder, 'discounts.pdf'))
    expect(imported.url).toMatch(/^file:\/\/\/.*\/discounts\.pdf$/)
    expect(readFileSync(imported.path)).toEqual(bytes)

    // 2. The pair the UI saves next, pointing at the copy — the folder lists both with no issues at all.
    const { output, input } = documentPair('discounts', imported.url)
    await post(server, { type: 'save-recipe', path: join(folder, 'discounts.output.json'), recipe: output })
    await post(server, { type: 'save-recipe', path: join(folder, 'discounts.input.json'), recipe: input })
    const workspace = await post<WorkspaceView>(server, { type: 'open-workspace', folder })
    const byKind = (kind: 'input' | 'output'): RecipeListing | undefined => workspace.recipes.find(recipe => recipe.kind === kind)
    expect(byKind('input')).toMatchObject({ id: 'discounts', issues: [] })
    expect(byKind('output')).toMatchObject({ id: 'discounts', issues: [] })

    // 3. What the content pane does right after: the start snapshot reads the copy as a PDF, so the PDF canvas opens.
    const snapshot = await post<SnapshotView>(server, { type: 'take-snapshot', recipeId: 'discounts', path: 'start' })
    expect(snapshot.format).toBe('pdf')
  })

  it('never overwrites a document already in the folder: a second drop of the same name gets a numbered copy', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-import-twice-'))
    const bytes = Buffer.from('%PDF-1.4').toString('base64')

    const first = await post<ImportDocumentView>(server, { type: 'import-document', folder, name: 'report.pdf', bytes })
    const second = await post<ImportDocumentView>(server, { type: 'import-document', folder, name: 'report.pdf', bytes })

    expect(first.path).toBe(join(folder, 'report.pdf'))
    expect(second.path).toBe(join(folder, 'report-2.pdf'))
  })

  it('refuses a name that would escape the folder', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-import-escape-'))

    await expect(post(server, { type: 'import-document', folder, name: '../escape.pdf', bytes: '' })).rejects.toThrow(/not a plain file name/)
    expect(existsSync(join(folder, '..', 'escape.pdf'))).toBe(false)
  })
})
