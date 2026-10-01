import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PdfCell, PdfDocument } from './pdf-document.model'
import { parseRegion, regionCells, regionSelector, regionText } from './pdf-region.algorithm'
import { readPdf } from './read-pdf.client'

const fixture = join(__dirname, 'fixtures', 'discounts.pdf')
let discounts: PdfDocument

beforeAll(async () => {
  discounts = await readPdf(new Uint8Array(readFileSync(fixture)))
})

function cell (x: number, y: number, text: string, width = text.length * 5, height = 10): PdfCell {
  return { x, y, width, height, text }
}

/** A two-page document with a title line, a two-cell line and a footer on each page, all at known points. */
function synthetic (): PdfDocument {
  const page = (number: number, footer: string): PdfDocument['pages'][number] => ({
    number,
    width:  595,
    height: 842,
    rows:   [
      { top: 810, bottom: 800, text: 'Title', cells: [cell(72, 800, 'Title')] },
      { top: 790, bottom: 780, text: 'Label\tValue', cells: [cell(72, 780, 'Label'), cell(300, 780, 'Value')] },
      { top: 50, bottom: 40, text: footer, cells: [cell(72, 40, footer)] },
    ],
  })

  return { kind: 'pdf', pages: [page(1, 'Page 1 of 2'), page(2, 'Page 2 of 2')] }
}

describe('parseRegion / regionSelector', () => {
  it('parses a page and two ranges, in points, either end first', () => {
    expect(parseRegion('page=1 x=72..252 y=640..664')).toEqual({ page: 1, x1: 72, y1: 640, x2: 252, y2: 664 })
    expect(parseRegion(' page=2  x=252..72 y=664.5..640 ')).toEqual({ page: 2, x1: 72, y1: 640, x2: 252, y2: 664.5 })
    expect(parseRegion('page=* x=0..595 y=0..60').page).toBe('*')
  })

  it('refuses anything else, naming the shape', () => {
    for (const bad of ['', '1:72,640,252,664', 'page=1 x=72..252', 'page=one x=1..2 y=3..4', 'x=1..2 y=3..4 page=1']) {
      expect(() => parseRegion(bad)).toThrow(/page=<number\|\*> x=<from>\.\.<to> y=<from>\.\.<to>/)
    }
  })

  it('writes a selector back in whole points, ranges ordered, that parses to the same box', () => {
    expect(regionSelector({ page: 1, x1: 252.4, y1: 663.6, x2: 72, y2: 640 })).toBe('page=1 x=72..252 y=640..664')
    expect(regionSelector({ page: '*', x1: 0, y1: 0, x2: 595, y2: 60 })).toBe('page=* x=0..595 y=0..60')
    const region = parseRegion(regionSelector({ page: 3, x1: 10, y1: 20, x2: 30, y2: 40 }))
    expect(region).toEqual({ page: 3, x1: 10, y1: 20, x2: 30, y2: 40 })
  })
})

describe('regionText', () => {
  it('reads the cells at least half inside the box on the named page, a row\'s cells joined by a space, rows by a newline', () => {
    const matches = regionText(synthetic(), { page: 1, x1: 60, y1: 775, x2: 400, y2: 815 })
    expect(matches).toEqual([{ page: 1, text: 'Title\nLabel Value', cells: [cell(72, 800, 'Title'), cell(72, 780, 'Label'), cell(300, 780, 'Value')] }])
  })

  it('a box that only grazes a cell leaves it out; one covering more than half of it takes it', () => {
    // "Value" spans x 300..325: a box ending at 310 covers 40% of it, one ending at 315 covers 60%.
    expect(regionText(synthetic(), { page: 1, x1: 60, y1: 775, x2: 310, y2: 795 })[0].text).toBe('Label')
    expect(regionText(synthetic(), { page: 1, x1: 60, y1: 775, x2: 315, y2: 795 })[0].text).toBe('Label Value')
  })

  it('gives no match for a page where nothing sits in the box, and none for a page the document does not have', () => {
    expect(regionText(synthetic(), { page: 1, x1: 400, y1: 100, x2: 500, y2: 200 })).toEqual([])
    expect(regionText(synthetic(), { page: 9, x1: 0, y1: 0, x2: 595, y2: 842 })).toEqual([])
  })

  it('page=* reads the same box off every page, in page order: a footer per page', () => {
    const matches = regionText(synthetic(), { page: '*', x1: 0, y1: 30, x2: 595, y2: 60 })
    expect(matches.map(match => [match.page, match.text])).toEqual([[1, 'Page 1 of 2'], [2, 'Page 2 of 2']])
  })

  it('reads the title line of the real fixture, outside any table, by the box around its own cell', () => {
    const page = discounts.pages[0]
    const title = page.rows.flatMap(row => row.cells).find(candidate => candidate.text.startsWith('DEALER DISCOUNTS'))
    if (title === undefined) throw new Error('the fixture lost its title line')
    const region = parseRegion(regionSelector({ page: 1, x1: title.x - 2, y1: title.y - 2, x2: title.x + title.width + 2, y2: title.y + title.height + 2 }))

    expect(regionText(discounts, region)).toEqual([{ page: 1, text: title.text, cells: [title] }])
  })
})

describe('regionCells', () => {
  it('is the cells regionText reads, for one page, in row order', () => {
    const [page] = synthetic().pages
    expect(regionCells(page, { page: 1, x1: 60, y1: 775, x2: 400, y2: 815 }).map(candidate => candidate.text)).toEqual(['Title', 'Label', 'Value'])
  })

  it('takes a zero-area cell by its position alone', () => {
    const page = { ...synthetic().pages[0], rows: [{ top: 10, bottom: 10, text: 'dot', cells: [cell(100, 100, 'dot', 0, 0)] }] }
    expect(regionCells(page, { page: 1, x1: 90, y1: 90, x2: 110, y2: 110 })).toHaveLength(1)
    expect(regionCells(page, { page: 1, x1: 110, y1: 110, x2: 120, y2: 120 })).toHaveLength(0)
  })
})
