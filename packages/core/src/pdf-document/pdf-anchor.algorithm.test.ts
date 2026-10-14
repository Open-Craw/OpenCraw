import type { PdfCell, PdfDocument, PdfRow } from './pdf-document.model'
import { anchorText, parseAnchor } from './pdf-anchor.algorithm'

function cell (x: number, y: number, text: string, width = text.length * 5, height = 10): PdfCell {
  return { x, y, width, height, text }
}

function row (...cells: PdfCell[]): PdfRow {
  return { top: Math.max(...cells.map(c => c.y + c.height)), bottom: Math.min(...cells.map(c => c.y)), text: cells.map(c => c.text).join('\t'), cells }
}

/** The same kind of document twice: the values sit at other points, the labels keep their text. */
function invoice (shift: number, number: string, total: string): PdfDocument {
  return {
    kind:  'pdf',
    pages: [{
      number: 1,
      width:  595,
      height: 842,
      rows:   [
        row(cell(72, 800 - shift, 'Invoice no'), cell(200, 800 - shift, number)),
        row(cell(72, 760 - shift, 'Bill to')),
        row(cell(72, 745 - shift, 'ACME Srl')),
        row(cell(72, 730 - shift, 'Via Roma 1')),
        row(cell(72, 700 - shift, 'Totale'), cell(300, 700 - shift, total)),
      ],
    }],
  }
}

describe('parseAnchor', () => {
  it('reads direction, count, page and a pattern that may hold spaces', () => {
    expect(parseAnchor('right of ^Valid until')).toMatchObject({ page: '*', direction: 'right', count: 1 })
    expect(parseAnchor('right of ^Valid until').pattern.source).toBe('^Valid until')
    expect(parseAnchor('page=2 below count=3 of ^Bill to')).toMatchObject({ page: 2, direction: 'below', count: 3 })
  })

  it('refuses a selector of another shape, a zero count and a bad pattern', () => {
    expect(() => parseAnchor('^Total')).toThrow(/is not "\[page=/)
    expect(() => parseAnchor('left of Total')).toThrow(/is not "\[page=/)
    expect(() => parseAnchor('below count=0 of Total')).toThrow(/count must be at least 1/)
    expect(() => parseAnchor('right of (')).toThrow(/not a regular expression/)
  })
})

describe('anchorText', () => {
  it('reads the cell to the right of a label, wherever it sits', () => {
    const anchor = parseAnchor('right of ^Invoice no')
    expect(anchorText(invoice(0, 'A-1', '10,00'), anchor).map(match => match.text)).toEqual(['A-1'])
    expect(anchorText(invoice(120, 'B-22', '99,00'), anchor).map(match => match.text)).toEqual(['B-22'])
  })

  it('reads the lines under a label, in its column only, nearest first', () => {
    const document = invoice(0, 'A-1', '10,00')
    expect(anchorText(document, parseAnchor('below of ^Bill to')).map(match => match.text)).toEqual(['ACME Srl'])
    expect(anchorText(document, parseAnchor('below count=2 of ^Bill to')).map(match => match.text)).toEqual(['ACME Srl\nVia Roma 1'])
  })

  it('matches the label case-insensitively and reports the cells it read', () => {
    const [match] = anchorText(invoice(0, 'A-1', '10,00'), parseAnchor('right of ^totale'))
    expect(match.text).toBe('10,00')
    expect(match.label.text).toBe('Totale')
    expect(match.cells.map(c => c.text)).toEqual(['10,00'])
  })

  it('gives no match when the label is missing or has nothing beside it', () => {
    const document = invoice(0, 'A-1', '10,00')
    expect(anchorText(document, parseAnchor('right of ^Nowhere'))).toEqual([])
    expect(anchorText(document, parseAnchor('right of ^Bill to'))).toEqual([])
    expect(anchorText(document, parseAnchor('below of ^Totale'))).toEqual([])
  })

  it('reads one text per page that has the label with page=*, or just the page named', () => {
    const second = invoice(0, 'A-2', '20,00').pages[0]
    const document: PdfDocument = { kind: 'pdf', pages: [invoice(0, 'A-1', '10,00').pages[0], { ...second, number: 2 }] }
    expect(anchorText(document, parseAnchor('right of ^Totale')).map(match => [match.page, match.text])).toEqual([[1, '10,00'], [2, '20,00']])
    expect(anchorText(document, parseAnchor('page=2 right of ^Totale')).map(match => [match.page, match.text])).toEqual([[2, '20,00']])
  })
})
