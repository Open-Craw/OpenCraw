import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createCrawler, loadRecipes, memorySink } from '../src/index'

// CrawlOptions.sample: a crawler-level budget for a preview run, checked in
// addition to (never instead of) each recipe's own `limits.maxRecords` (studio phase 0, #89).
describe('CrawlOptions.sample', () => {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-sample-'))
  const page2File = join(folder, 'page2.json')
  const page1File = join(folder, 'page1.json')
  writeFileSync(page2File, JSON.stringify({ items: [{ name: 'b1', price: '3' }, { name: 'b2', price: '4' }], nextPage: null }))
  writeFileSync(page1File, JSON.stringify({ items: [{ name: 'a1', price: '1' }, { name: 'a2', price: '2' }], nextPage: pathToFileURL(page2File).href }))

  // Two pages of two records each, paginated through a "nextPage" URL, entirely from local files: no network, no browser.
  const recipeSet = () => loadRecipes([
    { kind: 'output', id: 'item', version: 1, fields: { name: { type: 'string', required: true, key: true }, price: { type: 'number', required: true } } },
    {
      kind:   'input',
      id:     'items',
      output: 'item',
      mode:   'api',
      start:  [{ url: pathToFileURL(page1File).href }],
      steps:  [
        {
          type:  'paginate',
          next:  { jsonpath: '$.nextPage' },
          steps: [
            { type: 'request', id: 'list', url: '{{page.url}}', as: 'json' },
            { type: 'extract', id: 'items', from: 'list', selector: '$.items[*]', kind: 'jsonpath', take: 'json', many: true },
            { type: 'forEach', over: 'items', as: 'item', emit: true, steps: [] },
          ],
        },
      ],
      mapping: { name: { from: 'item.name' }, price: { from: 'item.price' } },
    },
  ])

  it('runs both pages to completion and reports no stoppedBy when no budget applies', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const report = await crawler.run(await recipeSet())
      expect(report.recipes[0].emitted).toBe(4)
      expect(report.recipes[0].stoppedBy).toBeUndefined()
    } finally {
      await crawler.close()
    }
  })

  it('stops at maxRecords mid-page and reports it', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink, sample: { maxRecords: 3 } })
    try {
      const report = await crawler.run(await recipeSet())
      expect(report.recipes[0].emitted).toBe(3)
      expect(report.recipes[0].stoppedBy).toBe('sample-maxRecords')
      expect(sink.records.map(record => record.data.name)).toEqual(['a1', 'a2', 'b1'])
    } finally {
      await crawler.close()
    }
  })

  it('stops at maxPages, letting the page in progress finish', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink, sample: { maxPages: 1 } })
    try {
      const report = await crawler.run(await recipeSet())
      expect(report.recipes[0].emitted).toBe(2)
      expect(report.recipes[0].stoppedBy).toBe('sample-maxPages')
      expect(sink.records.map(record => record.data.name)).toEqual(['a1', 'a2'])
    } finally {
      await crawler.close()
    }
  })

  it('stops at maxMs', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink, sample: { maxMs: 0 } })
    try {
      const report = await crawler.run(await recipeSet())
      expect(report.recipes[0].stoppedBy).toBe('sample-maxMs')
      expect(report.recipes[0].emitted).toBeLessThan(4)
    } finally {
      await crawler.close()
    }
  })
})
