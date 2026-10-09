import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SampleRunRecord } from './sample-run-record.contract'
import { runSample } from './run-sample.use-case'

function folderOf (files: Record<string, unknown>): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-sample-run-'))
  for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, name), JSON.stringify(content))

  return folder
}

const OUTPUT = { kind: 'output', id: 'item', version: 1, fields: { name: { type: 'string', required: true, key: true }, price: { type: 'number', required: true } } }
const DATA = { items: [{ name: 'a1', price: '1' }, { name: 'a2', price: '2' }, { name: 'a3', price: '3' }] }

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
      { type: 'forEach', over: 'entries', as: 'item', emit: true, steps: [] },
    ],
    mapping: { name: { from: 'item.name' }, price: { from: 'item.price' } },
  }
}

describe('runSample', () => {
  it('runs to completion, streaming records and trace lines', async () => {
    const folder = folderOf({})
    const dataFile = join(folder, 'data.json')
    writeFileSync(dataFile, JSON.stringify(DATA))
    writeFileSync(join(folder, 'item.output.json'), JSON.stringify(OUTPUT))
    writeFileSync(join(folder, 'items.input.json'), JSON.stringify(inputRecipe(dataFile)))

    const traceLines: string[] = []
    const records: SampleRunRecord[] = []
    const handle = await runSample(folder, 'items', undefined, {
      onTraceLine: line => { traceLines.push(line) },
      onRecord:    record => { records.push(record) },
    })
    const result = await handle.result

    expect(result.emitted).toBe(3)
    expect(result.error).toBeUndefined()
    expect(result.stoppedBy).toBeUndefined()
    expect(records.map(record => record.data.name)).toEqual(['a1', 'a2', 'a3'])
    expect(result.records.map(record => record.data.name)).toEqual(['a1', 'a2', 'a3'])
    expect(traceLines.some(line => line.includes('■'))).toBe(true)
  })

  it('reports a recipe the engine refuses to start as an error on the run, not a rejection (issue #148)', async () => {
    const folder = folderOf({})
    const dataFile = join(folder, 'data.json')
    writeFileSync(dataFile, JSON.stringify(DATA))
    writeFileSync(join(folder, 'item.output.json'), JSON.stringify(OUTPUT))
    const recipe = inputRecipe(dataFile) as { mapping: Record<string, unknown> }
    recipe.mapping.price = { from: 'item.price', transform: [{ op: 'hook', name: 'nope' }] }
    writeFileSync(join(folder, 'items.input.json'), JSON.stringify(recipe))

    const handle = await runSample(folder, 'items', undefined, { onTraceLine: () => undefined, onRecord: () => undefined })
    const result = await handle.result

    expect(result.recipeId).toBe('items')
    expect(result.emitted).toBe(0)
    expect(result.error).toContain('nope')
    expect(result.error).toContain('Studio was started without hooks')
    expect(result.error).toContain('opencraw studio --hooks <file>')
  })

  it('runs the hook it was started with, and names the file and its hooks when the recipe calls another (issue #150)', async () => {
    const folder = folderOf({})
    const dataFile = join(folder, 'data.json')
    writeFileSync(dataFile, JSON.stringify(DATA))
    writeFileSync(join(folder, 'item.output.json'), JSON.stringify(OUTPUT))
    const recipe = inputRecipe(dataFile) as { mapping: Record<string, unknown> }
    recipe.mapping.price = { from: 'item.price', transform: [{ op: 'hook', name: 'nope' }] }
    writeFileSync(join(folder, 'items.input.json'), JSON.stringify(recipe))

    const handle = await runSample(folder, 'items', undefined, { onTraceLine: () => undefined, onRecord: () => undefined }, undefined, { source: 'hooks.mjs', hooks: { other: input => input } })
    const result = await handle.result

    expect(result.error).toContain('not one of the hooks in hooks.mjs: other')
  })

  it('stops at the given sample budget and reports it', async () => {
    const folder = folderOf({})
    const dataFile = join(folder, 'data.json')
    writeFileSync(dataFile, JSON.stringify(DATA))
    writeFileSync(join(folder, 'item.output.json'), JSON.stringify(OUTPUT))
    writeFileSync(join(folder, 'items.input.json'), JSON.stringify(inputRecipe(dataFile)))

    const handle = await runSample(folder, 'items', { maxRecords: 2 }, { onTraceLine: () => {}, onRecord: () => {} })
    const result = await handle.result

    expect(result.emitted).toBe(2)
    expect(result.stoppedBy).toBe('sample-maxRecords')
  })
})
