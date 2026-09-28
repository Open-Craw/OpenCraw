import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLastRunCache, loadRecipePair, recordLastRun, runSample } from '../sample-run'
import type { LastRunCache } from '../sample-run'
import { explainWhy } from './why.use-case'

const OUTPUT = {
  kind:    'output',
  id:      'item',
  version: 1,
  fields:  {
    name:  { type: 'string', required: true, key: true },
    price: { type: 'integer', required: false },
  },
}
const DATA = { items: [{ name: 'a1', price: '1' }, { name: 'a2' }] }

function inputRecipe (dataFile: string): unknown {
  return {
    kind:   'input',
    id:     'items',
    output: 'item',
    mode:   'api',
    start:  [{ url: `file://${dataFile}` }],
    steps:  [
      { type: 'request', id: 'list', url: '{{start.url}}', as: 'json' },
      { type: 'extract', id: 'entries', from: 'list', selector: '$.items[*]', kind: 'jsonpath', take: 'json', many: true },
      { type: 'forEach', over: 'entries', as: 'item', emit: true, steps: [{ type: 'extract', id: 'priceRead', from: 'item', selector: '$.price', kind: 'jsonpath', onError: { policy: 'skip' } }] },
    ],
    mapping: { name: { from: 'item.name' }, price: { from: 'priceRead' } },
  }
}

async function runToCache (): Promise<{ folder: string, cache: LastRunCache }> {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-why-'))
  const dataFile = join(folder, 'data.json')
  writeFileSync(dataFile, JSON.stringify(DATA))
  writeFileSync(join(folder, 'item.output.json'), JSON.stringify(OUTPUT))
  writeFileSync(join(folder, 'items.input.json'), JSON.stringify(inputRecipe(dataFile)))

  const handle = await runSample(folder, 'items', undefined, { onTraceLine: () => {}, onRecord: () => {} })
  const result = await handle.result
  const cache = createLastRunCache()
  recordLastRun(cache, 'items', result)

  return { folder, cache }
}

describe('explainWhy', () => {
  it('throws when no sample has run yet for the recipe', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-why-empty-'))
    await expect(explainWhy(folder, createLastRunCache(), loadRecipePair, { kind: 'missing', recipeId: 'items', recordIndex: 0, field: 'price' }))
      .rejects.toThrow(/no finished sample run/)
  })

  it('names the field, the step that binds the missing source, and the missing-value policy — the second item has no "price" key, so priceRead reads nothing', async () => {
    const { folder, cache } = await runToCache()

    const view = await explainWhy(folder, cache, loadRecipePair, { kind: 'missing', recipeId: 'items', recordIndex: 1, field: 'price' })

    expect(view.field).toBe('price')
    expect(view.policy).toBe('null')
    expect(view.stepPath).toBe('steps.2.steps.0')
    expect(view.sentence).toContain('"price" is missing')
    expect(view.sentence).toContain('steps.2.steps.0')
    expect(view.sentence).toContain('priceRead')
    expect(view.sentence).toContain('left null by policy')
  })

  it('explains a rejection with the reason and the skip-record policy, when the field is set to reject instead of null', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-why-reject-'))
    const dataFile = join(folder, 'data.json')
    writeFileSync(dataFile, JSON.stringify({ items: [{ name: 'a1', price: 'not-a-number' }] }))
    writeFileSync(join(folder, 'item.output.json'), JSON.stringify({ kind: 'output', id: 'item', version: 1, fields: { name: { type: 'string', required: true, key: true }, price: { type: 'integer', onMissing: 'skip-record' } } }))
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
      mapping: { name: { from: 'item.name' }, price: { from: 'item.price' } },
    }))
    const handle = await runSample(folder, 'items', undefined, { onTraceLine: () => {}, onRecord: () => {} })
    const result = await handle.result
    expect(result.rejectedRecords).toHaveLength(1)
    const cache = createLastRunCache()
    recordLastRun(cache, 'items', result)

    const view = await explainWhy(folder, cache, loadRecipePair, { kind: 'rejected', recipeId: 'items', rejectedIndex: 0 })

    expect(view.field).toBe('price')
    expect(view.policy).toBe('skip-record')
    expect(view.reason).toMatch(/integer/)
    expect(view.sentence).toContain('"price" was rejected')
    expect(view.sentence).toContain('(policy: skip-record)')
  })
})
