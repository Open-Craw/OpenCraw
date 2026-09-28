import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleRunSample } from './run-sample.handler'
import { handleExplainWhy } from './explain-why.handler'
import { createStudioState } from './workspace.store'

function workspace (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-why-handler-'))
  const dataFile = join(folder, 'data.json')
  writeFileSync(dataFile, JSON.stringify({ items: [{ name: 'a1' }] }))
  writeFileSync(join(folder, 'item.output.json'), JSON.stringify({ kind: 'output', id: 'item', version: 1, fields: { name: { type: 'string', required: true, key: true }, note: { type: 'string' } } }))
  writeFileSync(join(folder, 'items.input.json'), JSON.stringify({
    kind:   'input',
    id:     'items',
    output: 'item',
    mode:   'api',
    start:  [{ url: `file://${dataFile}` }],
    steps:  [
      { type: 'request', id: 'list', url: '{{start.url}}', as: 'json' },
      { type: 'extract', id: 'entries', from: 'list', selector: '$.items[*]', kind: 'jsonpath', take: 'json', many: true },
      { type: 'forEach', over: 'entries', as: 'item', emit: true, steps: [] },
    ],
    mapping: { name: { from: 'item.name' }, note: { from: 'item.note' } },
  }))

  return folder
}

describe('handleExplainWhy', () => {
  it('rejects when no workspace is open', async () => {
    await expect(handleExplainWhy(createStudioState(), { type: 'explain-why', target: { kind: 'missing', recipeId: 'items', recordIndex: 0, field: 'note' } }))
      .rejects.toThrow('open a workspace first')
  })

  it('rejects when the recipe has not been sampled yet', async () => {
    const state = createStudioState()
    state.folder = workspace()
    await expect(handleExplainWhy(state, { type: 'explain-why', target: { kind: 'missing', recipeId: 'items', recordIndex: 0, field: 'note' } }))
      .rejects.toThrow(/no finished sample run/)
  })

  it('explains a missing value after a sample has run', async () => {
    const state = createStudioState()
    state.folder = workspace()
    await handleRunSample(state, { type: 'run-sample', recipeId: 'items' })
    await state.activeRun?.result

    const view = await handleExplainWhy(state, { type: 'explain-why', target: { kind: 'missing', recipeId: 'items', recordIndex: 0, field: 'note' } })

    expect(view.field).toBe('note')
    expect(view.sentence).toContain('"note" is missing')
  })
})
