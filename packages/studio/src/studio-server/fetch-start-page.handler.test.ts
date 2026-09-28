import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleFetchStartPage } from './fetch-start-page.handler'
import { createStudioState } from './workspace.store'

describe('handleFetchStartPage', () => {
  it('rejects when no workspace is open', async () => {
    await expect(handleFetchStartPage(createStudioState(), { type: 'fetch-start-page', recipeId: 'items' })).rejects.toThrow('open a workspace first')
  })

  it('fetches the api-mode start point as text', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-page-handler-'))
    const dataFile = join(folder, 'page.html')
    writeFileSync(dataFile, '<!doctype html><html><body><h1>hi</h1></body></html>')
    writeFileSync(join(folder, 'item.output.json'), JSON.stringify({ kind: 'output', id: 'item', version: 1, fields: { name: { type: 'string' } } }))
    writeFileSync(join(folder, 'items.input.json'), JSON.stringify({ kind: 'input', id: 'items', output: 'item', mode: 'api', start: [{ url: `file://${dataFile}` }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}', as: 'html' }, { type: 'emit' }], mapping: {} }))
    const state = createStudioState()
    state.folder = folder

    const view = await handleFetchStartPage(state, { type: 'fetch-start-page', recipeId: 'items' })
    expect(view.html).toContain('<h1>hi</h1>')
  })
})
