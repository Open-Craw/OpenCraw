import type { PdfCellView, PdfPageView } from '@opencraw/studio'
import { idFromLabel, labelledValueOf, paragraphBox } from './pdf-prose.algorithm'

function cell (x: number, y: number, text: string, height = 14, width = 200): PdfCellView {
  return { x, y, width, height, text }
}

function pageOf (...lines: PdfCellView[][]): PdfPageView {
  const rows = lines.map(cells => ({ top: Math.max(...cells.map(c => c.y + c.height)), bottom: Math.min(...cells.map(c => c.y)), cells }))

  return { number: 1, width: 595, height: 842, rows, rowCount: rows.length, cellCount: lines.flat().length, hasTextLayer: true }
}

describe('paragraphBox', () => {
  const first = cell(29, 700, 'Northwind reduced its operational emissions')
  const second = cell(29, 685, 'baseline. The company sources 72 percent')
  const heading = cell(29, 740, 'Summary', 20, 80)
  const next = cell(29, 640, 'A separate paragraph, a paragraph break away')

  it('takes the following lines of a wrapped paragraph', () => {
    const page = pageOf([heading], [first], [second], [next])

    expect(paragraphBox(page, first)).toEqual({ x1: 29, y1: 685, x2: 229, y2: 714 })
  })

  it('takes the lines above when a later one is clicked', () => {
    const page = pageOf([heading], [first], [second], [next])

    expect(paragraphBox(page, second)).toEqual(paragraphBox(page, first))
  })

  it('does not take a heading of another size, nor a paragraph after a break', () => {
    const page = pageOf([heading], [first], [second], [next])

    expect(paragraphBox(page, heading)).toEqual({ x1: 29, y1: 740, x2: 109, y2: 760 })
    expect(paragraphBox(page, next).y1).toBe(640)
  })

  it('leaves a table row alone', () => {
    const left = cell(29, 700, 'Model', 14, 80)
    const right = cell(300, 700, 'Price', 14, 80)
    const below = cell(29, 685, 'Sportage', 14, 80)
    const page = pageOf([left, right], [below])

    expect(paragraphBox(page, left)).toEqual({ x1: 29, y1: 700, x2: 109, y2: 714 })
  })
})

describe('labelledValueOf', () => {
  it.each([
    ['Author: Marta Ferreira, Head of Sustainability', { label: 'Author', value: 'Marta Ferreira, Head of Sustainability' }],
    ['Phone: +44 20 7946 0123', { label: 'Phone', value: '+44 20 7946 0123' }],
    ['Valid until:   31 Dec 2026', { label: 'Valid until', value: '31 Dec 2026' }],
  ])('splits %s', (text, expected) => {
    expect(labelledValueOf(text)).toEqual(expected)
  })

  it.each(['10:30 departure', 'https://example.test/a', 'Summary', 'Note:', 'A long sentence that is not a label at all, really, before a colon: then more'])('leaves %s alone', (text) => {
    expect(labelledValueOf(text)).toBeUndefined()
  })
})

describe('idFromLabel', () => {
  it.each([
    ['Author', 'author'],
    ['Head of Sustainability', 'headOfSustainability'],
    ['2025 total', 'value2025Total'],
    ['---', 'value'],
  ])('names %s %s', (label, id) => {
    expect(idFromLabel(label)).toBe(id)
  })
})
