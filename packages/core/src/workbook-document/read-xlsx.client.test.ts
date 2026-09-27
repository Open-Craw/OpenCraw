import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readXlsxWorkbook } from './read-xlsx.client'

const fixtures = join(__dirname, '..', '..', '..', 'office-reader', 'src', 'spreadsheet', 'fixtures')

describe('readXlsxWorkbook', () => {
  it('writes a time of day as the time alone, in the 1900 and the 1904 date systems', async () => {
    const book = await readXlsxWorkbook(readFileSync(join(fixtures, 'incentivi.xlsx')), 'incentivi.xlsx')
    expect(book.sheets[0].rows[4][5]).toBe('2026-06-01')
    expect(book.sheets[0].rows[5][5]).toBe('2026-06-01T09:30:00')
    expect(book.sheets[0].rows[8][2]).toBe('12:00:00')
    const mac = await readXlsxWorkbook(readFileSync(join(fixtures, 'date1904.xlsx')), 'date1904.xlsx')
    expect(mac.sheets[0].rows).toEqual([['2026-06-01', '12:00:00']])
  })
})
