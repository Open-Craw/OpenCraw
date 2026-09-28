import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { csvWorkbook, readPdf } from '@opencraw/core'
import type { PdfDocument, WorkbookDocument } from '@opencraw/core'
import { previewGridTable, previewPdfTable } from './table-preview.use-case'

const fixture = join(__dirname, '..', '..', '..', '..', 'packages', 'core', 'src', 'pdf-document', 'fixtures', 'discounts.pdf')
const listinoPath = join(__dirname, '..', '..', '..', '..', 'packages', 'core', 'src', 'workbook-document', 'fixtures', 'listino.csv')

describe('previewPdfTable', () => {
  let document: PdfDocument

  beforeAll(async () => {
    document = await readPdf(new Uint8Array(readFileSync(fixture)))
  })

  it('matches the same tables findTables/analyzeTables would, with the header row index and every regrouped row highlighted', () => {
    const result = previewPdfTable(document, { header: '^MODELS ALPHA', until: '^NOTE' })
    expect(result.error).toBeUndefined()
    expect(result.matches).toHaveLength(1)
    const [match] = result.matches
    expect(match.page).toBe(1)
    expect(document.pages[0].rows[match.headerRowIndex].text).toMatch(/^MODELS ALPHA/i)
    expect(match.table.rows).toHaveLength(6)
    // Every row index is inside the page and in order, header first.
    expect(match.matchedRowIndices[0]).toBe(match.headerRowIndex)
    expect(match.matchedRowIndices).toEqual([...match.matchedRowIndices].sort((a, b) => a - b))
    expect(new Set(match.matchedRowIndices).size).toBe(match.matchedRowIndices.length)
  })

  it('names the output by the columns option', () => {
    const result = previewPdfTable(document, { header: '^MODELS ALPHA', until: '^NOTE', columns: { model: '^MODELS' } })
    expect(result.matches[0].table.rows[0]).toHaveProperty('model')
  })

  it('gives the column bands and the tolerance that clustered them, for a column-band pick', () => {
    const result = previewPdfTable(document, { header: '^MODELS ALPHA', until: '^NOTE' })
    const [match] = result.matches
    expect(match.bands.length).toBeGreaterThan(0)
    expect(match.bands.map(band => band.name)).toEqual(expect.arrayContaining(['MODELS ALPHA']))
    expect(match.bandTolerance).toBeGreaterThan(0)
  })

  it('finds no matches for a header that matches nothing, without erroring', () => {
    const result = previewPdfTable(document, { header: '^NOTHING WILL MATCH THIS' })
    expect(result.error).toBeUndefined()
    expect(result.matches).toEqual([])
  })

  it('answers with an error (and no matches) instead of throwing when a pattern does not compile — expected mid-keystroke', () => {
    const result = previewPdfTable(document, { header: '(unterminated' })
    expect(result.matches).toEqual([])
    expect(result.error).toMatch(/selector/)
  })

  it('reports an invalid "until" or column pattern the same way', () => {
    expect(previewPdfTable(document, { header: '^MODELS', until: '(unterminated' }).error).toMatch(/until/)
    expect(previewPdfTable(document, { header: '^MODELS', columns: { x: '(unterminated' } }).error).toMatch(/columns\.x/)
  })

  it('is a pure function of the document and the options: running it twice gives the same result', () => {
    const first = previewPdfTable(document, { header: '^MODELS ALPHA', until: '^NOTE' })
    const second = previewPdfTable(document, { header: '^MODELS ALPHA', until: '^NOTE' })
    expect(second).toEqual(first)
  })
})

describe('previewGridTable', () => {
  const bytes = readFileSync(listinoPath)
  const listino: WorkbookDocument = csvWorkbook(new TextDecoder('windows-1252').decode(bytes), { name: 'listino', encoding: 'windows-1252' })

  it('matches the same tables findGridTables would, named by the header cells', () => {
    const result = previewGridTable(listino, { header: '^Marca Modello', until: '^Totale' })
    expect(result.error).toBeUndefined()
    expect(result.matches).toHaveLength(1)
    const [match] = result.matches
    expect(match.sheet).toBe('listino')
    expect(match.header).toEqual(['Marca', 'Modello', 'Versione', 'Prezzo €', 'Sconto %'])
    expect(match.rows).toHaveLength(4)
    expect(match.rows[0]).toEqual({ 'Marca': 'Fiat', 'Modello': 'Pandina', 'Versione': '1.0 Hybrid "Cross"', 'Prezzo €': '15.950,00', 'Sconto %': '12,5' })
  })

  it('names the output by the columns option, and fills a group written once down its rows', () => {
    const result = previewGridTable(listino, {
      header:   '^Marca',
      until:    '^Totale',
      columns:  { brand: '^Marca$', model: '^Modello$', price: '^Prezzo' },
      fillDown: ['brand', 'model'],
    })
    expect(result.matches[0].rows.slice(0, 2)).toEqual([
      { brand: 'Fiat', model: 'Pandina', price: '15.950,00' },
      { brand: 'Fiat', model: 'Pandina', price: '16.450,00' },
    ])
  })

  it('scopes to the sheets the "sheet" option matches', () => {
    expect(previewGridTable(listino, { header: '^Marca', sheet: '^does-not-exist$' }).matches).toEqual([])
    expect(previewGridTable(listino, { header: '^Marca', sheet: '^listino$' }).matches).toHaveLength(1)
  })

  it('finds no matches for a header that matches nothing, without erroring', () => {
    const result = previewGridTable(listino, { header: '^NOTHING WILL MATCH THIS' })
    expect(result.error).toBeUndefined()
    expect(result.matches).toEqual([])
  })

  it('answers with an error (and no matches) instead of throwing when a pattern does not compile', () => {
    const result = previewGridTable(listino, { header: '(unterminated' })
    expect(result.matches).toEqual([])
    expect(result.error).toMatch(/selector/)
  })

  it('reports an invalid "until", "sheet" or column pattern the same way', () => {
    expect(previewGridTable(listino, { header: '^Marca', until: '(unterminated' }).error).toMatch(/until/)
    expect(previewGridTable(listino, { header: '^Marca', sheet: '(unterminated' }).error).toMatch(/sheet/)
    expect(previewGridTable(listino, { header: '^Marca', columns: { x: '(unterminated' } }).error).toMatch(/columns\.x/)
  })

  it('is a pure function of the document and the options: running it twice gives the same result', () => {
    const first = previewGridTable(listino, { header: '^Marca', until: '^Totale' })
    const second = previewGridTable(listino, { header: '^Marca', until: '^Totale' })
    expect(second).toEqual(first)
  })
})
