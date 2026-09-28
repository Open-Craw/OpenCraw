import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cachedSnapshot } from '../page-snapshot'
import { handleTakeSnapshot } from './take-snapshot.handler'
import { createStudioState } from './workspace.store'

function apiWorkspace (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-snapshot-handler-'))
  const dataFile = join(folder, 'page.html')
  writeFileSync(dataFile, '<!doctype html><html><body><a href="/next">go</a></body></html>')
  writeFileSync(join(folder, 'item.output.json'), JSON.stringify({ kind: 'output', id: 'item', version: 1, fields: { name: { type: 'string' } } }))
  writeFileSync(join(folder, 'items.input.json'), JSON.stringify({ kind: 'input', id: 'items', output: 'item', mode: 'api', start: [{ url: `file://${dataFile}` }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}', as: 'html' }, { type: 'emit' }], mapping: {} }))

  return folder
}

describe('handleTakeSnapshot', () => {
  it('rejects when no workspace is open', async () => {
    await expect(handleTakeSnapshot(createStudioState(), { type: 'take-snapshot', recipeId: 'items', path: 'start' })).rejects.toThrow('open a workspace first')
  })

  it('captures, rewrites and caches the snapshot', async () => {
    const state = createStudioState()
    state.folder = apiWorkspace()

    const view = await handleTakeSnapshot(state, { type: 'take-snapshot', recipeId: 'items', path: 'start' })
    expect(view.html).toContain('data-oc-node="n0"')
    expect(cachedSnapshot(state.snapshots, 'items', 'start')).toEqual(view)
  })

  it('answers from the cache on a second call, without recapturing', async () => {
    const state = createStudioState()
    state.folder = apiWorkspace()

    const first = await handleTakeSnapshot(state, { type: 'take-snapshot', recipeId: 'items', path: 'start' })
    const second = await handleTakeSnapshot(state, { type: 'take-snapshot', recipeId: 'items', path: 'start' })
    expect(second).toBe(first) // the very same object: the cached entry, not a recapture
  })
})
