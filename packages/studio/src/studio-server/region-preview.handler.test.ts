import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { handleRegionPreview } from './region-preview.handler'
import { handleTakeSnapshot } from './take-snapshot.handler'
import { createStudioState } from './workspace.store'

const DISCOUNTS_FIXTURE = join(__dirname, '..', '..', '..', 'core', 'src', 'pdf-document', 'fixtures', 'discounts.pdf')
const INCENTIVI_FIXTURE = join(__dirname, '..', '..', '..', 'office-reader', 'src', 'presentation', 'fixtures', 'incentivi.pptx')

/** A fresh folder with an api-mode recipe `id` reading `fixture` by its `file:` URL. */
function workspace (id: string, fixture: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-region-handler-'))
  writeFileSync(join(folder, `${id}.output.json`), JSON.stringify({ kind: 'output', id, version: 1, fields: {} }))
  writeFileSync(join(folder, `${id}.input.json`), JSON.stringify({ kind: 'input', id, output: id, mode: 'api', start: [{ url: pathToFileURL(fixture).href }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}' }], mapping: {} }))

  return folder
}

function pdfWorkspace (): string {
  return workspace('discounts', DISCOUNTS_FIXTURE)
}

describe('handleRegionPreview', () => {
  it('needs a cached snapshot first', () => {
    const state = createStudioState()
    expect(() => handleRegionPreview(state, { type: 'region-preview', recipeId: 'discounts', path: 'start', selector: 'page=1 x=0..595 y=0..842' })).toThrow('call take-snapshot first')
  })

  it('answers the engine\'s own matches off the cached PDF: the title line by the box around it', async () => {
    const state = createStudioState()
    state.folder = pdfWorkspace()
    await handleTakeSnapshot(state, { type: 'take-snapshot', recipeId: 'discounts', path: 'start' })

    const wholePage = handleRegionPreview(state, { type: 'region-preview', recipeId: 'discounts', path: 'start', selector: 'page=1 x=0..595 y=0..842' })
    const title = wholePage.matches[0].cells.find(cell => cell.text.startsWith('DEALER DISCOUNTS'))
    if (title === undefined) throw new Error('the fixture lost its title line')
    const around = `page=1 x=${String(Math.floor(title.x))}..${String(Math.ceil(title.x + title.width))} y=${String(Math.floor(title.y))}..${String(Math.ceil(title.y + title.height))}`

    const preview = handleRegionPreview(state, { type: 'region-preview', recipeId: 'discounts', path: 'start', selector: around })
    expect(preview).toEqual({ matches: [{ page: 1, text: title.text, cells: [title], shapes: [] }] })
  })

  it('answers the engine\'s own matches off a cached deck: the source line on slide 3 by the box around its text box (#122)', async () => {
    const state = createStudioState()
    state.folder = workspace('incentivi', INCENTIVI_FIXTURE)
    await handleTakeSnapshot(state, { type: 'take-snapshot', recipeId: 'incentivi', path: 'start' })

    const wholeSlide = handleRegionPreview(state, { type: 'region-preview', recipeId: 'incentivi', path: 'start', selector: 'slide=3 x=0..960 y=0..540' })
    const source = wholeSlide.matches[0].shapes.find(shape => shape.text.startsWith('Fonte'))
    if (source === undefined) throw new Error('the fixture lost its source line')
    const around = `slide=3 x=${String(Math.floor(source.x))}..${String(Math.ceil(source.x + source.width))} y=${String(Math.floor(source.y))}..${String(Math.ceil(source.y + source.height))}`

    const preview = handleRegionPreview(state, { type: 'region-preview', recipeId: 'incentivi', path: 'start', selector: around })
    expect(preview).toEqual({ matches: [{ page: 3, text: source.text, cells: [], shapes: [source] }] })
    expect(handleRegionPreview(state, { type: 'region-preview', recipeId: 'incentivi', path: 'start', selector: 'page=3 x=0..960 y=0..540' }).error).toMatch(/this document is a deck/)
  })

  it('reports a selector that does not parse as error, not as a failure', async () => {
    const state = createStudioState()
    state.folder = pdfWorkspace()
    await handleTakeSnapshot(state, { type: 'take-snapshot', recipeId: 'discounts', path: 'start' })

    const preview = handleRegionPreview(state, { type: 'region-preview', recipeId: 'discounts', path: 'start', selector: 'somewhere' })
    expect(preview.matches).toEqual([])
    expect(preview.error).toMatch(/page=<number\|\*>/)
  })
})
