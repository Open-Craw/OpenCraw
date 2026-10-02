import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleOpenWorkspace } from './open-workspace.handler'
import { createStudioState } from './workspace.store'

describe('handleOpenWorkspace', () => {
  it('opens the folder, remembers it, and tells connected clients', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-handler-'))
    writeFileSync(join(folder, 'book.output.json'), JSON.stringify({ kind: 'output', id: 'book', version: 1, fields: { title: { type: 'string', required: true, key: true } } }))
    const state = createStudioState()
    const received: string[] = []
    state.sockets.add({ send: text => { received.push(text) }, close: () => {}, onMessage: () => {}, onClose: () => {} })

    const view = await handleOpenWorkspace(state, { type: 'open-workspace', folder })

    expect(view.recipes).toHaveLength(1)
    expect(state.folder).toBe(folder)
    expect(received).toEqual([JSON.stringify({ type: 'workspace-changed' })])
  })

  it('re-opening the folder already open re-reads it but tells nobody: a client re-fetching on workspace-changed must not be answered with another workspace-changed', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-handler-'))
    const state = createStudioState()
    const received: string[] = []
    state.sockets.add({ send: text => { received.push(text) }, close: () => {}, onMessage: () => {}, onClose: () => {} })

    await handleOpenWorkspace(state, { type: 'open-workspace', folder })
    writeFileSync(join(folder, 'book.output.json'), JSON.stringify({ kind: 'output', id: 'book', version: 1, fields: {} }))
    const again = await handleOpenWorkspace(state, { type: 'open-workspace', folder })

    expect(again.recipes).toHaveLength(1) // a fresh read every time, not a cached one
    expect(received).toHaveLength(1) // the first open only
  })
})
