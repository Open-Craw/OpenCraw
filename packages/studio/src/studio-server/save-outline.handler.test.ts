import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recipeToOutline } from '../scope-outline'
import { handleSaveOutline } from './save-outline.handler'
import { createStudioState } from './workspace.store'

describe('handleSaveOutline', () => {
  it('converts the outline back to the recipe, writes the file and broadcasts workspace-changed', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-save-outline-'))
    const path = join(folder, 'books.input.json')
    const content = { kind: 'input', id: 'books', steps: [{ type: 'goto', url: '/' }, { type: 'emit' }] }
    const outline = recipeToOutline(content)
    const state = createStudioState()
    const received: string[] = []
    state.sockets.add({ send: text => { received.push(text) }, close: () => {}, onMessage: () => {}, onClose: () => {} })

    const response = await handleSaveOutline(state, { type: 'save-outline', path, outline })

    expect(response).toEqual({ saved: true })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(content)
    expect(received).toEqual([JSON.stringify({ type: 'workspace-changed' })])
  })
})
