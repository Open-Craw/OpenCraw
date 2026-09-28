import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { csvWorkbook, readXlsxWorkbook } from '@opencraw/core'
import type { WorkbookDocument } from '@opencraw/core'
import { workbookDocumentView } from './workbook-view.mapper'

const listinoPath = join(__dirname, '..', '..', '..', 'core', 'src', 'workbook-document', 'fixtures', 'listino.csv')
const incentiviPath = join(__dirname, '..', '..', '..', 'office-reader', 'src', 'spreadsheet', 'fixtures', 'incentivi.xlsx')

describe('workbookDocumentView', () => {
  it('carries a CSV sheet\'s cells over as text, and the detected delimiter/encoding', () => {
    const bytes = readFileSync(listinoPath)
    const document = csvWorkbook(new TextDecoder('windows-1252').decode(bytes), { name: 'listino', encoding: 'windows-1252' })
    const view = workbookDocumentView(document)
    expect(view.sheets).toHaveLength(1)
    expect(view.csv).toEqual({ encoding: 'windows-1252', delimiter: ';' })
    const [sheet] = view.sheets
    expect(sheet.name).toBe('listino')
    expect(sheet.hidden).toBe(false)
    expect(sheet.hiddenRows).toEqual([])
    expect(sheet.merges).toEqual([])
    expect(sheet.rows[2].map(cell => cell.value)).toEqual(['Marca', 'Modello', 'Versione', 'Prezzo €', 'Sconto %']) // row 2: a title and a blank line sit above the header
    expect(sheet.rows[2].every(cell => cell.type === 'string')).toBe(true) // a CSV's cells are all text
  })

  it('types a spreadsheet\'s cells (a number, a date as ISO, a boolean stay themselves; a date-looking string is typed "date"), marks hidden sheets/rows, and resolves merges to bounds', async () => {
    const document = await readXlsxWorkbook(new Uint8Array(readFileSync(incentiviPath)), incentiviPath)
    const view = workbookDocumentView(document)
    expect(view.csv).toBeUndefined() // not a CSV
    expect(view.sheets.map(sheet => [sheet.name, sheet.hidden])).toEqual([['Incentivi giugno', false], ['Archivio', true], ['Maggio', false]])
    const [sheet] = view.sheets
    expect(sheet.hiddenRows).toEqual([6])
    expect(sheet.merges).toEqual([
      { ref: 'A1:H1', top: 0, left: 0, bottom: 0, right: 7 },
      { ref: 'A3:A4', top: 2, left: 0, bottom: 3, right: 0 },
      { ref: 'B3:B4', top: 2, left: 1, bottom: 3, right: 1 },
      { ref: 'C3:D3', top: 2, left: 2, bottom: 2, right: 3 },
      { ref: 'E3:E4', top: 2, left: 4, bottom: 3, right: 4 },
      { ref: 'F3:F4', top: 2, left: 5, bottom: 3, right: 5 },
      { ref: 'A5:A6', top: 4, left: 0, bottom: 5, right: 0 },
    ])
    const dataRow = sheet.rows[4].map(cell => [cell.value, cell.type])
    expect(dataRow).toEqual([
      ['Fiat', 'string'],
      ['Pandina', 'string'],
      [15_950, 'number'],
      [13_955.625, 'number'],
      [0.125, 'number'],
      ['2026-06-01', 'date'],
      [true, 'boolean'],
      ['Solo rottamazione', 'string'],
    ])
  })

  it('gives every sheet a columnCount wide enough for its widest (possibly ragged) row', () => {
    const document: WorkbookDocument = { kind: 'workbook', sheets: [{ name: 's', rows: [['a', 'b'], ['c'], ['d', 'e', 'f']] }] }
    expect(workbookDocumentView(document).sheets[0].columnCount).toBe(3)
  })

  it('is a pure function: running it twice on the same document gives the same result', () => {
    const document: WorkbookDocument = { kind: 'workbook', sheets: [{ name: 's', rows: [['a']] }] }
    expect(workbookDocumentView(document)).toEqual(workbookDocumentView(document))
  })
})
