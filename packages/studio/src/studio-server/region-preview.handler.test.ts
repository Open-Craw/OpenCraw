import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { handleRegionPreview } from './region-preview.handler'
import { handleTakeSnapshot } from './take-snapshot.handler'
import { createStudioState } from './workspace.store'

const DISCOUNTS_FIXTURE = join(__dirname, '..', '..', '..', 'core', 'src', 'pdf-document', 'fixtures', 'discounts.pdf')

function pdfWorkspace (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-region-handler-'))
  writeFileSync(join(folder, 'discounts.output.json'), JSON.stringify({ kind: 'output', id: 'discounts', version: 1, fields: {} }))
  writeFileSync(join(folder, 'discounts.input.json'), JSON.stringify({ kind: 'input', id: 'discounts', output: 'discounts', mode: 'api', start: [{ url: pathToFileURL(DISCOUNTS_FIXTURE).href }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}' }], mapping: {} }))

  return folder
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
    expect(preview).toEqual({ matches: [{ page: 1, text: title.text, cells: [title] }] })
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
