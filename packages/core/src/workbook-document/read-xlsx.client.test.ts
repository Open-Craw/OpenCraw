import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { readXlsxWorkbook } from './read-xlsx.client'

const fixtures = join(__dirname, '..', '..', '..', 'office-reader', 'src', 'spreadsheet', 'fixtures')

describe('readXlsxWorkbook', () => {
  it('reads an OpenDocument spreadsheet like a workbook, and says what to do with another OpenDocument file', async () => {
    const ods = await readXlsxWorkbook(readFileSync(join(fixtures, '..', '..', 'opendocument-spreadsheet', 'fixtures', 'incentivi.ods')), 'incentivi.ods')
    const xlsx = await readXlsxWorkbook(readFileSync(join(fixtures, 'incentivi.xlsx')), 'incentivi.xlsx')
    // What the two formats store alike: not the column widths and row heights the .ods fixture leaves out.
    const shape = (book: typeof ods): unknown => book.sheets.map(sheet => ({ name: sheet.name, hidden: sheet.hidden, hiddenRows: sheet.hiddenRows, rows: sheet.rows, merges: [...(sheet.merges ?? [])].sort((a, b) => a.localeCompare(b)) }))
    expect(shape(ods)).toEqual(shape(xlsx))
    const text = zipSync({ 'mimetype': [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }], 'content.xml': strToU8('<x/>') })
    await expect(readXlsxWorkbook(text, 'letter.odt')).rejects.toThrow(/letter\.odt: .*OpenDocument/)
  })

  it('writes a time of day as the time alone, in the 1900 and the 1904 date systems', async () => {
    const book = await readXlsxWorkbook(readFileSync(join(fixtures, 'incentivi.xlsx')), 'incentivi.xlsx')
    expect(book.sheets[0].rows[4][5]).toBe('2026-06-01')
    expect(book.sheets[0].rows[5][5]).toBe('2026-06-01T09:30:00')
    expect(book.sheets[0].rows[8][2]).toBe('12:00:00')
    const mac = await readXlsxWorkbook(readFileSync(join(fixtures, 'date1904.xlsx')), 'date1904.xlsx')
    expect(mac.sheets[0].rows).toEqual([['2026-06-01', '12:00:00']])
  })
})
