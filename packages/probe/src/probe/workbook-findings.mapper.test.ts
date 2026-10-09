import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { csvWorkbook } from '@opencraw/core'
import { describeWorkbook } from './workbook-findings.mapper'

// The fixture holds Windows-1252 bytes 0x80 (€) and 0x96 (–). Decoded by hand: some Node builds' TextDecoder('windows-1252') is plain Latin-1 (issue #131).
function windows1252Text (bytes: Buffer): string {
  return bytes.toString('latin1').replaceAll('', '€').replaceAll('', '–')
}

const bytes = readFileSync(join(__dirname, '..', '..', '..', 'core', 'src', 'workbook-document', 'fixtures', 'listino.csv'))
const listino = csvWorkbook(windows1252Text(bytes), { name: 'listino', encoding: 'windows-1252' })

describe('describeWorkbook', () => {
  it('reports how a CSV was read, its rows, and its header with a selector', () => {
    const findings = describeWorkbook(listino)
    expect(findings.csv).toEqual({ encoding: 'windows-1252', delimiter: ';' })
    expect(findings.sheets).toEqual([{ name: 'listino', hidden: false, rows: 9, columns: 5 }])
    expect(findings.rows[1]).toEqual({ sheet: 'listino', row: 3, text: 'Marca | Modello | Versione | Prezzo € | Sconto %' })
    expect(findings.headers).toEqual([{ sheet: 'listino', row: 3, text: 'Marca | Modello | Versione | Prezzo € | Sconto %', selector: '^Marca' }])
  })

  it('hints at a second header row when the header has merged cells, and leaves hidden sheets out of the rows', () => {
    const findings = describeWorkbook({
      kind:   'workbook',
      sheets: [
        { name: 'FZ', rows: [['Brand', 'Total', ''], ['', 'August', 'Share'], ['ALFA', '33', '7.7']], merges: ['A1:A2', 'B1:C1'] },
        { name: 'Old', hidden: true, rows: [['secret', 'x']] },
      ],
    })
    expect(findings.headers).toEqual([{ sheet: 'FZ', row: 1, text: 'Brand | Total', selector: '^Brand', hint: 'merged header cells: try "headerRows": 2' }, { sheet: 'FZ', row: 2, text: 'August | Share', selector: '^August' }])
    expect(findings.rows.map(row => row.sheet)).toEqual(['FZ', 'FZ', 'FZ'])
    expect(findings.sheets[1]).toEqual({ name: 'Old', hidden: true, rows: 1, columns: 2 })
  })
})

describe('describeWorkbook: header detection', () => {
  it('finds headers whose words contain digits (#73)', () => {
    const gsa = { name: 'Master', rows: [['FY2026 Per Diem Rates - Effective October 1, 2025'], ['ID', 'STATE', 'DESTINATION', 'SEASON BEGIN', 'FY26 Lodging Rate', 'FY26 M&IE'], ['Standard CONUS rate applies', '', '', '', 110, 68], [2, 'AL', 'Gulf Shores', 'October 1', 134, 74]] }
    const fcc = { name: 'table 2', rows: [['FY 2026 RADIO STATION REGULATORY FEES', '', ''], ['Population Served', 'AM Class A', 'FM Classes A, B1 & C3'], ['<=10,000', '2659 $560', '2663 $615']], merges: ['A1:C1'] }
    const findings = describeWorkbook({ kind: 'workbook', sheets: [gsa, fcc] })
    expect(findings.headers.map(({ sheet, row, selector }) => [sheet, row, selector])).toEqual([['Master', 2, '^ID'], ['table 2', 2, '^Population Served']])
  })

  it('reads the rows under a header as its body, not as more headers (#73)', () => {
    const slide = { name: 'table 1', rows: [['Headlines', 'Current Status', 'RAG'], ['Capital Programme', 'On track', 'Green'], ['Asset Disposals', 'None planned', 'Green'], ['Cash days', '42', 'Amber'], [], ['Ref', 'Risk', 'RAG'], ['R1', 'Enrolment down 5%', 'Red'], ['R2', 'Pay award 3%', 'Amber']] }
    const findings = describeWorkbook({ kind: 'workbook', sheets: [slide] })
    expect(findings.headers.map(({ row, selector }) => [row, selector])).toEqual([[1, '^Headlines'], [6, '^Ref']])
  })
})
