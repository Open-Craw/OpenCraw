import type { PdfCellView, PdfPageView } from '@opencraw/studio'
import { choicesOf, shapeOf } from './pdf-selection-choices.algorithm'
import { sectionCardNode } from './pdf-pick.mapper'

function cell (x: number, y: number, text: string, height = 10, width = 200): PdfCellView {
  return { x, y, width, height, text }
}

function pageOf (...lines: PdfCellView[][]): PdfPageView {
  const rows = lines.map(cells => ({ top: Math.max(...cells.map(c => c.y + c.height)), bottom: Math.min(...cells.map(c => c.y)), cells }))

  return { number: 1, width: 595, height: 842, rows, rowCount: rows.length, cellCount: lines.flat().length, hasTextLayer: true }
}

const date = cell(40, 700, '16 October 2026')
const reference = cell(40, 686, 'Reference# Account ID')
const page = pageOf([cell(40, 740, 'SUBSCRIPTION SERVICES', 16, 150)], [date], [reference], [cell(40, 660, 'COMMERCIAL TERMS', 16, 150)], [cell(40, 640, 'Terms line')], [cell(40, 560, 'Other heading', 16, 150)], [cell(40, 540, 'x')])

describe('shapeOf', () => {
  it.each([
    ['16 October 2026', 'date'],
    ['Due 2026-10-16 sharp', 'date'],
    ['Write to leia@rebels.org today', 'email address'],
    ['Base MSRP: £18,500.', 'amount'],
  ])('knows %s is a %s', (text, name) => {
    expect(shapeOf(text)?.name).toBe(name)
  })

  it('finds no shape in plain words', () => {
    expect(shapeOf('Reference# Account ID')).toBeUndefined()
  })
})

describe('choicesOf', () => {
  it('offers the whole block, just that line, the date in the block and a fixed position, for a line under a heading', () => {
    const choices = choicesOf([page], page, date, { x1: 40, y1: 700, x2: 240, y2: 710 })

    expect(choices.map(choice => choice.anchor?.kind === 'section' ? [choice.anchor.line, choice.anchor.matchName] : 'position')).toEqual([[undefined, undefined], [1, undefined], [undefined, 'date'], 'position'])
  })

  it('offers no line or shape choice for a line without a shape that is not the first, but its own line number', () => {
    const choices = choicesOf([page], page, reference, { x1: 40, y1: 686, x2: 240, y2: 696 })

    expect(choices.map(choice => choice.anchor?.kind === 'section' ? choice.anchor.line : 'position')).toEqual([undefined, 2, 'position'])
  })
})

describe('sectionCardNode narrowed', () => {
  it('writes the line and the pattern into the step', () => {
    const card = sectionCardNode('SUBSCRIPTION SERVICES', 'COMMERCIAL TERMS', false, 'steps.1', 'date', { line: 1, match: String.raw`(\d{1,2} [A-Za-z]{3,9} \d{4})` })

    expect(card.step).toMatchObject({ kind: 'section', selector: '^SUBSCRIPTION SERVICES$', until: '^COMMERCIAL TERMS$', line: 1, match: String.raw`(\d{1,2} [A-Za-z]{3,9} \d{4})` })
  })
})
