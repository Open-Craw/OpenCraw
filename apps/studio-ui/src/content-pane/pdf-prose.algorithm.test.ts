import type { PdfCellView, PdfPageView } from '@opencraw/studio'
import { anchorOf, idFromLabel, labelledValueOf, paragraphBox } from './pdf-prose.algorithm'

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

describe('anchorOf', () => {
  const title = [cell(78, 690, 'OFFICIAL SPECIFICATION SHEET:', 24, 397)]
  const name = [cell(78, 668, 'CityCompact Eco', 24, 199)]
  const details = [cell(78, 609, 'Details', 16, 52)]
  const price = [cell(78, 512, 'Price', 16, 39)]
  const first = cell(78, 591, 'This entry-level hatchback features a compact urban profile.', 10, 400)
  const second = cell(78, 567, 'Equipped with standard 15-inch alloy wheels.', 10, 450)
  const msrp = cell(78, 494, 'Base MSRP: £18,500. Destination charge: £995.', 10, 216)
  const page = pageOf(title, name, details, [first], [second], price, [msrp])

  it('anchors a body line to the section under its heading, up to the next heading', () => {
    const anchor = anchorOf([page], page, second)

    expect(anchor).toMatchObject({ kind: 'section', heading: 'Details', until: 'Price', ignoreHeadersFooters: false })
  })

  it('anchors the last section to the end of the document, a label line included', () => {
    const anchor = anchorOf([page], page, msrp)

    expect(anchor).toMatchObject({ kind: 'section', heading: 'Price' })
    expect(anchor && 'until' in anchor).toBe(false)
  })

  it('anchors a headline line to the line above it, even when two are stacked tight', () => {
    expect(anchorOf([page], page, name[0])).toMatchObject({ kind: 'after', previous: 'OFFICIAL SPECIFICATION SHEET:' })
  })

  it('does not take a lone title for a heading: lines under it are not one section', () => {
    const lone = pageOf([cell(78, 700, 'Annual Report', 24, 200)], [cell(78, 660, 'Author: Marta', 10, 100)], [cell(78, 640, 'Second line', 10, 100)])
    const author = lone.rows[1]?.cells[0]

    expect(anchorOf([lone], lone, author)?.kind).not.toBe('section')
  })

  it('leaves the running header and footer out, and says the document has them', () => {
    const withMargins = pageOf([cell(78, 770, 'ACME Annual report', 9, 150)], details, [first], price, [msrp])
    const header = withMargins.rows[0]
    if (header === undefined) throw new Error('no header row')
    header.running = true

    expect(anchorOf([withMargins], withMargins, first)).toMatchObject({ kind: 'section', heading: 'Details', ignoreHeadersFooters: true })
  })
})

/** A one-cell heading row, as the anchor tests lay them out. */
function heading (y: number, text: string): PdfCellView[] {
  return [cell(51, y, text, 13, 60)]
}

describe('anchorOf across pages and columns', () => {
  it('finds the heading on an earlier page for a line that continues its section', () => {
    const first = pageOf(heading(700, 'DETAILS'), [cell(51, 680, 'Body of details.', 10, 100)], heading(500, 'TERMS'), [cell(51, 480, 'Item one.', 10, 100)])
    const second = pageOf([cell(51, 700, 'Item two continues here.', 10, 120)])
    second.number = 2
    const clicked = second.rows[0]?.cells[0]

    expect(anchorOf([first, second], second, clicked)).toMatchObject({ kind: 'section', heading: 'TERMS' })
  })

  it('anchors a line in a column of two to the section, not as a field', () => {
    const left = cell(51, 680, 'Left column text', 10, 230)
    const right = cell(306, 680, 'Right column text', 10, 230)
    const page = pageOf(heading(700, 'Details'), [left, right], heading(600, 'Price'), [cell(51, 580, '$1', 10, 30)])

    expect(anchorOf([page], page, right)).toMatchObject({ kind: 'section', heading: 'Details', until: 'Price' })
  })

  it('leaves a row of labelled fields to the label rule', () => {
    const one = cell(61, 724, 'Reference ID: REF-1', 9, 118)
    const two = cell(197, 724, 'Effective Date: Oct 1', 9, 125)
    const page = pageOf(heading(750, 'Overview'), [one, two], heading(600, 'Price'), [cell(51, 580, '$1', 10, 30)])

    expect(anchorOf([page], page, one)).toBeUndefined()
  })
})
