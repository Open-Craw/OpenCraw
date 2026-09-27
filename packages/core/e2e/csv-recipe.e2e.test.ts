import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createCrawler, loadRecipes, loadRecipeSet, memorySink } from '../src/index'
import { FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = {
  kind:    'output',
  id:      'list-price',
  version: 1,
  fields:  {
    brand:   { type: 'string', key: true, required: true },
    model:   { type: 'string', key: true, required: true },
    version: { type: 'string', key: true, required: true },
    price:   { type: 'number', required: true },
    source:  { type: 'url', generated: 'sourceUrl' },
  },
}

const input = {
  kind:   'input',
  id:     'price-list',
  output: 'list-price',
  mode:   'api',
  start:  [{ url: `${FIXTURE_BASE}/listino.csv` }],
  steps:  [
    { type: 'request', url: '{{start.url}}' },
    { type: 'extract', id: 'table', selector: '^Marca Modello', kind: 'table', until: '^Totale', fillDown: ['brand', 'model'], columns: { brand: '^Marca$', model: '^Modello$', version: '^Versione$', price: '^Prezzo' } },
    { type: 'set', id: 'rows', value: '{{table.rows}}' },
    { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] },
  ],
  mapping: {
    brand:   { from: 'row.brand' },
    model:   { from: 'row.model' },
    version: { from: 'row.version', transform: [{ op: 'replace', pattern: String.raw`\s+`, replacement: ' ', flags: 'g' }] },
    price:   { from: 'row.price', transform: [{ op: 'number', locale: 'it-IT' }] },
  },
}

describe('csv recipe (a Windows-1252, semicolon-separated price list served as text/csv)', () => {
  it('reads the list into records: encoding and delimiter detected, the model written once filled down', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const report = await crawler.run(await loadRecipes([output, input]))
      expect(report.recipes[0]).toMatchObject({ recipeId: 'price-list', emitted: 4, rejected: 0 })
      const source = `${FIXTURE_BASE}/listino.csv`
      expect(sink.records.map(({ data }) => data)).toEqual([
        { brand: 'Fiat', model: 'Pandina', version: '1.0 Hybrid "Cross"', price: 15_950, source },
        { brand: 'Fiat', model: 'Pandina', version: '1.0 Hybrid Icon', price: 16_450, source },
        { brand: 'Citroën', model: 'C3', version: 'Plus; automatica nuova', price: 19_300, source },
        { brand: 'Peugeot', model: '208', version: 'Allure', price: 21_450, source },
      ])
    } finally {
      await crawler.close()
    }
  })

  it('reads the list from a file: URL relative to the recipe file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'csv-recipe-'))
    await mkdir(join(directory, 'data'))
    await copyFile(join(__dirname, '..', 'src', 'workbook-document', 'fixtures', 'listino.csv'), join(directory, 'data', 'listino.csv'))
    await writeFile(join(directory, 'list-price.output.json'), JSON.stringify(output))
    await writeFile(join(directory, 'price-list.input.json'), JSON.stringify({ ...input, start: [{ url: 'file:data/listino.csv' }] }))
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      // Run from elsewhere: the recipe's folder decides, not the working directory.
      const report = await crawler.run(await loadRecipeSet({ output: join(directory, 'list-price.output.json'), inputs: [directory] }))
      expect(report.recipes[0]).toMatchObject({ recipeId: 'price-list', emitted: 4, rejected: 0 })
      expect(sink.records[0].data).toMatchObject({ brand: 'Fiat', price: 15_950, source: pathToFileURL(join(directory, 'data', 'listino.csv')).href })
    } finally {
      await crawler.close()
    }
  })
})
