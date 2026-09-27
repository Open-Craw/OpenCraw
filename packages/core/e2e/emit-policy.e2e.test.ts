import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createCrawler, loadRecipes, memorySink } from '../src/index'

// A mapping failure on an emit step whose onError skips it drops that record only, wherever it falls (#79).
describe('a skipped mapping failure', () => {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-emit-'))
  const recipesFor = (prices: string[]) => {
    const file = join(folder, `${prices.join('-')}.json`)
    writeFileSync(file, JSON.stringify({ items: prices.map((price, index) => ({ name: `item ${index + 1}`, price })) }))

    return loadRecipes([
      { kind: 'output', id: 'item', version: 1, fields: { name: { type: 'string', required: true, key: true }, price: { type: 'number', required: true } } },
      {
        kind:   'input',
        id:     'items',
        output: 'item',
        mode:   'api',
        start:  [{ url: pathToFileURL(file).href }],
        steps:  [
          { type: 'request', id: 'document', url: '{{start.url}}', as: 'json' },
          { type: 'extract', id: 'items', from: 'document', selector: '$.items[*]', kind: 'jsonpath', take: 'json', many: true },
          { type: 'forEach', over: 'items', as: 'item', steps: [{ type: 'emit', onError: { policy: 'skip' } }] },
        ],
        mapping: { name: { from: 'item.name' }, price: { from: 'item.price' } },
      },
    ])
  }

  it.each([
    ['last', ['10', '20', 'call us']],
    ['first', ['call us', '10', '20']],
  ])('keeps the run going when it is the %s record', async (_where, prices) => {
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const report = await crawler.run(await recipesFor(prices))
      expect(report.recipes[0].error).toBeUndefined()
      expect(sink.records.map(record => record.data.price)).toEqual([10, 20])
    } finally {
      await crawler.close()
    }
  }, 60_000)
})
