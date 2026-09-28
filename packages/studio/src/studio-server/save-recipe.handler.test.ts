import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleSaveRecipe } from './save-recipe.handler'
import { createStudioState } from './workspace.store'

describe('handleSaveRecipe', () => {
  it('writes the file and broadcasts workspace-changed', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-save-handler-'))
    const path = join(folder, 'book.output.json')
    const state = createStudioState()
    const received: string[] = []
    state.sockets.add({ send: text => { received.push(text) }, close: () => {}, onMessage: () => {}, onClose: () => {} })

    const response = await handleSaveRecipe(state, { type: 'save-recipe', path, recipe: { kind: 'output', id: 'book' } })

    expect(response).toEqual({ saved: true })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ kind: 'output', id: 'book' })
    expect(received).toEqual([JSON.stringify({ type: 'workspace-changed' })])
  })
})
