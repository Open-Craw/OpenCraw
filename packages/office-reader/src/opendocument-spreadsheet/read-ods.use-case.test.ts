import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { readOds } from './read-ods.use-case'
import type { ReadOdsOptions } from './read-ods.use-case'

const NAMESPACES = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:calcext="urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0"'
const ODS_MIMETYPE = 'application/vnd.oasis.opendocument.spreadsheet'

/** An `.ods` as the apps write it: a stored `mimetype` entry first, then `content.xml`. */
function ods (body: string, styles = ''): Uint8Array {
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NAMESPACES}><office:automatic-styles>${styles}</office:automatic-styles><office:body><office:spreadsheet>${body}</office:spreadsheet></office:body></office:document-content>`

  return zipSync({ 'mimetype': [strToU8(ODS_MIMETYPE), { level: 0 }], 'content.xml': strToU8(content) })
}

const text = (value: string): string => `<table:table-cell office:value-type="string" calcext:value-type="string"><text:p>${value}</text:p></table:table-cell>`
const number = (value: number): string => `<table:table-cell office:value-type="float" office:value="${String(value)}" calcext:value-type="float"><text:p>${String(value)}</text:p></table:table-cell>`
const row = (...cells: string[]): string => `<table:table-row>${cells.join('')}</table:table-row>`
const table = (name: string, ...rows: string[]): string => `<table:table table:name="${name}">${rows.join('')}</table:table>`

/** The first sheet's rows of a workbook with one sheet of these rows. */
async function rowsOf (rows: string[], options?: ReadOdsOptions): Promise<unknown[][]> {
  const body = table('T', ...rows)
  const book = await readOds(ods(body), options)

  return book.sheets[0].rows
}

async function sheetNames (bytes: Uint8Array, sheets: ReadOdsOptions['sheets']): Promise<string[]> {
  const book = await readOds(bytes, { sheets })

  return book.sheets.map(sheet => sheet.name)
}

describe('readOds', () => {
  it('reads each sheet in order with its rows, numbers as numbers and text as text', async () => {
    const prices = table('Prices', row(text('Model'), text('Price')), row(text('Clio'), number(19_900)), row(text('Captur'), number(24_500.5)))
    const other = table('Other', row(text('x')))
    const book = await readOds(ods(prices + other))

    expect(book.date1904).toBe(false)
    expect(book.sheets.map(sheet => sheet.name)).toEqual(['Prices', 'Other'])
    expect(book.sheets[0].rows).toEqual([['Model', 'Price'], ['Clio', 19_900], ['Captur', 24_500.5]])
    expect(book.sheets[0].hidden).toBe(false)
  })

  it('reads percentages, currency, booleans, dates, times and errors', async () => {
    const cells = [
      '<table:table-cell office:value-type="percentage" office:value="0.125"><text:p>12.5%</text:p></table:table-cell>',
      '<table:table-cell office:value-type="currency" office:currency="EUR" office:value="15950"><text:p>€ 15,950.00</text:p></table:table-cell>',
      '<table:table-cell office:value-type="boolean" office:boolean-value="true"><text:p>TRUE</text:p></table:table-cell>',
      '<table:table-cell office:value-type="date" office:date-value="2026-06-01"><text:p>01/06/2026</text:p></table:table-cell>',
      '<table:table-cell office:value-type="date" office:date-value="2026-06-01T09:30:00"><text:p>x</text:p></table:table-cell>',
      '<table:table-cell office:value-type="time" office:time-value="PT09H30M00S"><text:p>09:30</text:p></table:table-cell>',
      '<table:table-cell office:value-type="string" calcext:value-type="error"><text:p>#DIV/0!</text:p></table:table-cell>',
    ]
    const rows = await rowsOf([row(...cells)])

    expect(rows[0]).toEqual([0.125, 15_950, true, new Date('2026-06-01T00:00:00Z'), new Date('2026-06-01T09:30:00Z'), new Date('1899-12-30T09:30:00Z'), { error: '#DIV/0!' }])
  })

  it('gives canonical text in text mode: shortest numbers, ISO dates, true/false, empty as an empty string', async () => {
    const cells = [
      number(78.6),
      '<table:table-cell office:value-type="boolean" office:boolean-value="false"/>',
      '<table:table-cell office:value-type="date" office:date-value="2026-06-01"/>',
      '<table:table-cell office:value-type="date" office:date-value="2026-06-01T09:30:00"/>',
      '<table:table-cell office:value-type="time" office:time-value="PT09H30M00S"/>',
      '<table:table-cell/>',
      text('end'),
    ]
    const rows = await rowsOf([row(...cells)], { values: 'text' })

    expect(rows[0]).toEqual(['78.6', 'false', '2026-06-01', '2026-06-01T09:30:00', '09:30:00', '', 'end'])
  })

  it('reads a cell of several paragraphs, spaces, tabs and line breaks as the text a person sees', async () => {
    const cell = '<table:table-cell office:value-type="string"><text:p>one  <text:s text:c="2"/>two<text:tab/>three<text:line-break/>four</text:p><text:p>second</text:p></table:table-cell>'
    const rows = await rowsOf([row(cell)])

    expect(rows[0][0]).toBe('one    two\tthree\nfour\nsecond')
  })

  it('uses office:string-value over the paragraphs when the cell has one', async () => {
    const cell = '<table:table-cell office:value-type="string" office:string-value="stored"><text:p>shown</text:p></table:table-cell>'
    const rows = await rowsOf([row(cell)])

    expect(rows[0][0]).toBe('stored')
  })

  it('expands repeated cells and rows that hold something, and drops the empty ones the format repeats to its limits', async () => {
    const gap = '<table:table-cell table:number-columns-repeated="3"/>'
    const tail = '<table:table-cell table:number-columns-repeated="1000"/>'
    const full = `<table:table-row table:number-rows-repeated="2">${text('a')}${gap}${text('b')}${tail}</table:table-row>`
    const filler = '<table:table-row table:number-rows-repeated="1048000"><table:table-cell table:number-columns-repeated="16384"/></table:table-row>'
    const rows = await rowsOf([full, filler])

    expect(rows).toEqual([['a', null, null, null, 'b'], ['a', null, null, null, 'b']])
  })

  it('keeps empty rows between rows that hold something, as empty rows', async () => {
    const gap = '<table:table-row table:number-rows-repeated="2"><table:table-cell/></table:table-row>'
    const rows = await rowsOf([row(text('top')), gap, row(text('bottom'))])

    expect(rows).toEqual([['top'], [], [], ['bottom']])
  })

  it('reports merged ranges as A1 references, with the value in the top-left cell', async () => {
    const merged = '<table:table-cell office:value-type="string" table:number-columns-spanned="2" table:number-rows-spanned="2"><text:p>Title</text:p></table:table-cell><table:covered-table-cell/>'
    const first = row(text('a'), merged)
    const covered = '<table:covered-table-cell/><table:covered-table-cell/>'
    const second = row(text('b'), covered, text('c'))
    const book = await readOds(ods(table('M', first, second)))

    expect(book.sheets[0].merges).toEqual(['B1:C2'])
    expect(book.sheets[0].rows).toEqual([['a', 'Title'], ['b', null, null, 'c']])
  })

  it('names columns beyond Z in merged ranges', async () => {
    const run = '<table:table-cell table:number-columns-repeated="26" office:value-type="string"><text:p>x</text:p></table:table-cell>'
    const wide = '<table:table-cell office:value-type="string" table:number-columns-spanned="3"><text:p>wide</text:p></table:table-cell>'
    const body = table('W', row(run, wide))
    const book = await readOds(ods(body))

    expect(book.sheets[0].merges).toEqual(['AA1:AC1'])
  })

  it('marks hidden sheets by their table style, and hidden and filtered rows', async () => {
    const styles = '<style:style style:name="ta1" style:family="table"><style:table-properties table:display="true"/></style:style><style:style style:name="ta2" style:family="table"><style:table-properties table:display="false"/></style:style>'
    const collapsed = `<table:table-row table:visibility="collapse">${text('b')}</table:table-row>`
    const filtered = `<table:table-row table:visibility="filter">${text('c')}</table:table-row>`
    const shown = `<table:table table:name="Shown" table:style-name="ta1">${row(text('a'))}${collapsed}${filtered}${row(text('d'))}</table:table>`
    const secret = `<table:table table:name="Secret" table:style-name="ta2">${row(text('s'))}</table:table>`
    const book = await readOds(ods(shown + secret, styles))

    expect(book.sheets.map(sheet => [sheet.name, sheet.hidden])).toEqual([['Shown', false], ['Secret', true]])
    expect(book.sheets[0].hiddenRows).toEqual([1, 2])
  })

  it('reads only the sheets asked for', async () => {
    const body = table('2025', row(text('a'))) + table('2026', row(text('b'))) + table('Notes', row(text('c')))
    const bytes = ods(body)

    expect(await sheetNames(bytes, '2026')).toEqual(['2026'])
    expect(await sheetNames(bytes, /^20/)).toEqual(['2025', '2026'])
    expect(await sheetNames(bytes, sheet => sheet.name === 'Notes')).toEqual(['Notes'])
  })

  it('ignores a table nested inside a cell', async () => {
    const inner = table('inner', row(text('deep')))
    const nested = `<table:table-cell office:value-type="string"><text:p>outer</text:p>${inner}</table:table-cell>`
    const next = text('next')
    const body = table('N', row(nested, next))
    const book = await readOds(ods(body))

    expect(book.sheets.map(sheet => sheet.name)).toEqual(['N'])
    expect(book.sheets[0].rows).toEqual([['outer', 'next']])
  })

  it('refuses other files with the reason', async () => {
    const odt = zipSync({ 'mimetype': [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }], 'content.xml': strToU8('<x/>') })
    const legacy = readFileSync(join(__dirname, '..', 'ooxml-package', 'fixtures', 'legacy.xls'))
    const xlsx = readFileSync(join(__dirname, '..', 'spreadsheet', 'fixtures', 'incentivi.xlsx'))

    await expect(readOds(odt)).rejects.toMatchObject({ code: 'unsupported-format' })
    await expect(readOds(new TextEncoder().encode('a,b\n1,2\n'))).rejects.toMatchObject({ code: 'not-zip' })
    await expect(readOds(legacy)).rejects.toMatchObject({ code: 'legacy-format' })
    await expect(readOds(xlsx)).rejects.toMatchObject({ code: 'unsupported-format' })
  })
})

describe('readOds on a workbook also saved as .xlsx', () => {
  it('gives the same sheets, rows, merges and hidden rows and sheets as readXlsx', async () => {
    const { readXlsx } = await import('../spreadsheet')
    const fromOds = await readOds(join(__dirname, 'fixtures', 'incentivi.ods'))
    const fromXlsx = await readXlsx(join(__dirname, '..', 'spreadsheet', 'fixtures', 'incentivi.xlsx'))
    const shape = (sheets: typeof fromOds.sheets): unknown => sheets.map(sheet => ({ name: sheet.name, hidden: sheet.hidden, rows: sheet.rows, hiddenRows: sheet.hiddenRows, merges: [...sheet.merges].sort((a, b) => a.localeCompare(b)) }))

    expect(shape(fromOds.sheets)).toEqual(shape(fromXlsx.sheets))
  })

  it('gives the same canonical text as readXlsx in text mode', async () => {
    const { readXlsx } = await import('../spreadsheet')
    const fromOds = await readOds(join(__dirname, 'fixtures', 'incentivi.ods'), { values: 'text' })
    const fromXlsx = await readXlsx(join(__dirname, '..', 'spreadsheet', 'fixtures', 'incentivi.xlsx'), { values: 'text' })

    expect(fromOds.sheets.map(sheet => sheet.rows)).toEqual(fromXlsx.sheets.map(sheet => sheet.rows))
  })
})
