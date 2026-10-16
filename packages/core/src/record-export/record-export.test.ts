import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { OutputRecord } from '../output-mapping'
import type { OutputRecipe } from '../recipe-schema'
import { parseCsv, readXlsxWorkbook } from '../workbook-document'
import { csvText } from './csv.algorithm'
import { fileSink } from './file-sink.repository'
import { htmlReport } from './html-report.algorithm'
import { outputFormatOf } from './output-format.policy'
import { cellOf, tableOf } from './table.mapper'
import { UnsupportedOutputFormatError } from './unsupported-output-format.error'
import { xlsxBytes } from './xlsx.algorithm'

const output: OutputRecipe = {
  kind:        'output',
  id:          'vehicle-prices',
  version:     1,
  description: 'What each car costs',
  fields:      {
    model:  { type: 'string', required: true, description: 'The model name' },
    price:  { type: 'number' },
    link:   { type: 'url' },
    hybrid: { type: 'boolean' },
  },
}

function record (data: Record<string, unknown>, index = 0): OutputRecord {
  return { data, key: null, source: { recipeId: 'shop', url: `https://shop.test/${String(index)}`, emittedAt: '2026-10-16T10:00:00.000Z' } }
}

const RECORDS = [
  record({ model: 'Twingo, "E-Tech"', price: 19900, link: 'https://shop.test/twingo', hybrid: false }, 0),
  record({ model: 'Line\nbreak <b>&', price: 24400.5, link: null, hybrid: true }, 1),
  record({ model: 'Extra', price: null, extra: ['a', 'b'] }, 2),
]

describe('outputFormatOf', () => {
  it.each([
    ['out.jsonl', 'jsonl'], ['out.JSON', 'json'], ['a/b/out.csv', 'csv'], ['out.xlsx', 'xlsx'],
    ['out.yml', 'yml'], ['out.yaml', 'yml'], ['out.html', 'html'], ['out.PDF', 'pdf'],
  ])('%s is written as %s', (path, format) => {
    expect(outputFormatOf(path)).toBe(format)
  })

  it('refuses any other extension, or none, and says which ones work', () => {
    expect(() => outputFormatOf('out.txt')).toThrow(UnsupportedOutputFormatError)
    expect(() => outputFormatOf('out.txt')).toThrow(/ends in ".txt".*\.jsonl, \.json, \.csv, \.xlsx, \.yml/)
    expect(() => outputFormatOf('records')).toThrow(/has no extension/)
  })
})

describe('tableOf', () => {
  it('has a column per output field in the recipe\'s order, then any value the output does not declare', () => {
    const table = tableOf(output, RECORDS)

    expect(table.columns.map(column => column.name)).toEqual(['model', 'price', 'link', 'hybrid', 'extra'])
    expect(table.columns[0]).toMatchObject({ type: 'string', description: 'The model name' })
    expect(table.rows[0]).toEqual(['Twingo, "E-Tech"', 19900, 'https://shop.test/twingo', false, ''])
    expect(table.rows[2]).toEqual(['Extra', '', '', '', '["a","b"]'])
  })

  it('keeps numbers and booleans typed, empties nothing, and writes a list or object as JSON', () => {
    expect([cellOf(1.5), cellOf(true), cellOf(null), cellOf(undefined), cellOf({ a: 1 }), cellOf(NaN)]).toEqual([1.5, true, '', '', '{"a":1}', 'NaN'])
  })
})

describe('csvText', () => {
  it('quotes what needs it and reads back as the same table', () => {
    const text = csvText(tableOf(output, RECORDS))

    expect(text.split('\r\n', 1)[0]).toBe('model,price,link,hybrid,extra')
    expect(text).toContain('"Twingo, ""E-Tech"""')
    expect(parseCsv(text, ',').at(-1)).toEqual(['Extra', '', '', '', '["a","b"]'])
  })
})

describe('xlsxBytes', () => {
  it('is a workbook the engine\'s own reader opens, with the header, typed cells and the sheet named after the output', async () => {
    const book = await readXlsxWorkbook(xlsxBytes(tableOf(output, RECORDS), output.id), 'vehicle-prices.xlsx')

    expect(book.sheets[0].name).toBe('vehicle-prices')
    expect(book.sheets[0].rows[0]).toEqual(['model', 'price', 'link', 'hybrid', 'extra'])
    expect(book.sheets[0].rows[1][0]).toBe('Twingo, "E-Tech"')
    expect(book.sheets[0].rows[1][1]).toBe(19900)
    expect(book.sheets[0].rows[2][0]).toBe('Line\nbreak <b>&')
    expect(book.sheets[0].rows[2][1]).toBe(24400.5)
  })

  it('names a sheet within Excel\'s limits', async () => {
    const book = await readXlsxWorkbook(xlsxBytes(tableOf(output, []), 'a/very:long?name*that[goes]on-and-on-past-the-limit'), 'x.xlsx')

    expect(book.sheets[0].name.length).toBeLessThanOrEqual(31)
    expect(book.sheets[0].name).not.toMatch(/[:\\/?*[\]]/)
  })
})

describe('htmlReport', () => {
  const html = htmlReport(tableOf(output, RECORDS), { title: output.id, description: output.description, generatedAt: new Date('2026-10-16T10:30:00Z') })

  it('is one page with the logo, the title, the count and the records', () => {
    expect(html).toContain('<svg')
    expect(html).toContain('aria-label="OpenCraw"')
    expect(html).toContain('<h1>vehicle-prices</h1>')
    expect(html).toContain('What each car costs')
    expect(html).toContain('<b>3 records</b>')
    expect(html).toContain('made 2026-10-16 10:30 UTC')
    expect(html).toContain('<th scope="col" title="string: The model name">model</th>')
  })

  it('escapes everything it shows, links only web addresses and holds no script', () => {
    expect(html).toContain('Line\nbreak &lt;b&gt;&amp;')
    expect(html).toContain('<a href="https://shop.test/twingo"')
    expect(html).not.toContain('<script')
    expect(htmlReport({ columns: [{ name: 'u' }], rows: [['javascript:alert(1)']] }, { title: 't' })).not.toContain('<a href')
  })

  it('right-aligns a column of numbers and says so when there are no records', () => {
    expect(html).toContain('<td class="num">19900</td>')
    expect(htmlReport(tableOf(output, []), { title: 't' })).toContain('No records in this run.')
  })
})

async function write (name: string): Promise<{ path: string, location: string | undefined, written: number }> {
  const directory = await mkdtemp(join(tmpdir(), 'export-'))
  const path = join(directory, 'nested', name)
  const sink = fileSink(path, { now: () => new Date('2026-10-16T10:30:00Z') })
  await sink.open(output)
  for (const item of RECORDS) await sink.write(item)
  const summary = await sink.close()

  return { path, location: summary.location, written: summary.written }
}

describe('fileSink', () => {
  it('writes JSON Lines as each record arrives', async () => {
    const { path, written } = await write('out.jsonl')
    const file = await readFile(path, 'utf8')
    const lines = file.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)

    expect(written).toBe(3)
    expect(lines[0]).toMatchObject({ model: 'Twingo, "E-Tech"', _source: { recipeId: 'shop' } })
  })

  it('writes JSON as an array of the same objects', async () => {
    const { path } = await write('out.json')
    const all = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>[]

    expect(all).toHaveLength(3)
    expect(all[1]).toMatchObject({ model: 'Line\nbreak <b>&', price: 24400.5, _source: { url: 'https://shop.test/1' } })
  })

  it('writes YAML a YAML reader reads back', async () => {
    const { path } = await write('out.yaml')
    const all = parseYaml(await readFile(path, 'utf8')) as Record<string, unknown>[]

    expect(all[0]).toMatchObject({ model: 'Twingo, "E-Tech"', price: 19900, hybrid: false })
  })

  it('writes CSV, Excel and HTML with the output\'s fields as columns', async () => {
    const csv = await write('out.csv')
    const csvFile = await readFile(csv.path, 'utf8')
    expect(csvFile.split('\r\n', 1)[0]).toBe('model,price,link,hybrid,extra')

    const xlsx = await write('out.xlsx')
    const xlsxBytesRead = new Uint8Array(await readFile(xlsx.path))
    const book = await readXlsxWorkbook(xlsxBytesRead, 'out.xlsx')
    expect(book.sheets[0].rows).toHaveLength(4)

    const html = await write('out.html')
    const page = await readFile(html.path, 'utf8')
    expect(page).toContain('<b>3 records</b>')
    expect(html.location).toBe(html.path)
  })

  it('refuses an unknown extension before anything runs', () => {
    expect(() => fileSink('records.txt')).toThrow(UnsupportedOutputFormatError)
  })

  it('appends only to JSON Lines', () => {
    expect(() => fileSink('records.csv', { append: true })).toThrow(/only JSON Lines/)
    expect(() => fileSink('records.jsonl', { append: true })).not.toThrow()
  })

  it('writes a PDF a PDF reader opens, when a browser is available', async () => {
    let result: { path: string } | undefined
    try {
      result = await write('out.pdf')
    } catch (error) {
      // No Chromium on this machine (`npm run playwright:install` installs one): the page the PDF is printed from is covered above.
      if (!/Executable doesn't exist|browserType\.launch|Failed to launch/i.test(String(error))) throw error

      return
    }
    const bytes = new Uint8Array(await readFile(result.path))
    expect(String.fromCodePoint(...bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(2000)
  }, 60_000)
})
