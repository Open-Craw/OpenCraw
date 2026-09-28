import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { putSnapshot } from '../page-snapshot'
import { handleTakeSnapshot } from './take-snapshot.handler'
import { handleVerifySelector } from './verify-selector.handler'
import { createStudioState } from './workspace.store'

function apiWorkspace (bodyHtml: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-verify-handler-'))
  const dataFile = join(folder, 'page.html')
  writeFileSync(dataFile, bodyHtml)
  writeFileSync(join(folder, 'item.output.json'), JSON.stringify({ kind: 'output', id: 'item', version: 1, fields: { name: { type: 'string' } } }))
  writeFileSync(join(folder, 'items.input.json'), JSON.stringify({ kind: 'input', id: 'items', output: 'item', mode: 'api', start: [{ url: `file://${dataFile}` }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}', as: 'html' }, { type: 'emit' }], mapping: {} }))

  return folder
}

describe('handleVerifySelector', () => {
  it('rejects when no workspace is open', async () => {
    await expect(handleVerifySelector(createStudioState(), { type: 'verify-selector', recipeId: 'items', path: 'start', selector: '.x' })).rejects.toThrow('open a workspace first')
  })

  it('rejects when the step has no cached snapshot yet', async () => {
    const state = createStudioState()
    state.folder = apiWorkspace('<p class="price">10</p>')
    await expect(handleVerifySelector(state, { type: 'verify-selector', recipeId: 'items', path: 'start', selector: '.price' })).rejects.toThrow('call take-snapshot first')
  })

  it('reports the snapshot count and the live count for the start page, matching when the page did not change', async () => {
    const state = createStudioState()
    state.folder = apiWorkspace('<p class="price">10</p><p class="price">20</p>')
    await handleTakeSnapshot(state, { type: 'take-snapshot', recipeId: 'items', path: 'start' })

    const view = await handleVerifySelector(state, { type: 'verify-selector', recipeId: 'items', path: 'start', selector: '.price' })
    expect(view).toEqual({ selector: '.price', snapshotMatches: 2, liveChecked: true, liveMatches: 2 })
  })

  it('flags a selector that matches the (stale) snapshot but not the live page', async () => {
    const state = createStudioState()
    const folder = apiWorkspace('<p class="price">10</p>')
    state.folder = folder
    await handleTakeSnapshot(state, { type: 'take-snapshot', recipeId: 'items', path: 'start' })
    putSnapshot(state.snapshots, 'items', 'start', { html: '<p class="price" data-oc-node="n0">10</p>', nodeCount: 1, baseUrl: 'file:///stale', rawHtml: '<p class="price">10</p>' }) // pretend the cached snapshot is stale
    writeFileSync(join(folder, 'page.html'), '<p class="cost">10</p>') // the live page renamed its class

    const view = await handleVerifySelector(state, { type: 'verify-selector', recipeId: 'items', path: 'start', selector: '.price' })
    expect(view).toEqual({ selector: '.price', snapshotMatches: 1, liveChecked: true, liveMatches: 0 })
  })
})
