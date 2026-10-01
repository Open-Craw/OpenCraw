import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PdfCell, PdfDocument } from './pdf-document.model'
import { isInsideRegion, parseRegion, regionCells, regionSelector, regionText } from './pdf-region.algorithm'
import type { DocumentRegion } from './pdf-region.algorithm'
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

/** A region on page `at` of a PDF. */
function onPage (at: number | '*', x1: number, y1: number, x2: number, y2: number): DocumentRegion {
  return { on: 'page', at, x1, y1, x2, y2 }
}

describe('parseRegion / regionSelector', () => {
  it('parses a page (or a slide) and two ranges, in points, either end first', () => {
    expect(parseRegion('page=1 x=72..252 y=640..664')).toEqual(onPage(1, 72, 640, 252, 664))
    expect(parseRegion(' page=2  x=252..72 y=664.5..640 ')).toEqual(onPage(2, 72, 640, 252, 664.5))
    expect(parseRegion('page=* x=0..595 y=0..60').at).toBe('*')
    expect(parseRegion('slide=3 x=60..900 y=30..90')).toEqual({ on: 'slide', at: 3, x1: 60, y1: 30, x2: 900, y2: 90 })
  })

  it('refuses anything else, naming both shapes', () => {
    for (const bad of ['', '1:72,640,252,664', 'page=1 x=72..252', 'page=one x=1..2 y=3..4', 'x=1..2 y=3..4 page=1', 'sheet=1 x=1..2 y=3..4']) {
      expect(() => parseRegion(bad)).toThrow(/page=<number\|\*> x=<from>\.\.<to> y=<from>\.\.<to>.*slide=<number\|\*>/)
    }
  })

  it('writes a selector back in whole points, ranges ordered, that parses to the same box', () => {
    expect(regionSelector(onPage(1, 252.4, 663.6, 72, 640))).toBe('page=1 x=72..252 y=640..664')
    expect(regionSelector(onPage('*', 0, 0, 595, 60))).toBe('page=* x=0..595 y=0..60')
    expect(regionSelector({ on: 'slide', at: 2, x1: 60, y1: 30, x2: 900, y2: 90 })).toBe('slide=2 x=60..900 y=30..90')
    const written = regionSelector(onPage(3, 10, 20, 30, 40))
    expect(parseRegion(written)).toEqual(onPage(3, 10, 20, 30, 40))
  })
})

describe('regionText', () => {
  it('reads the cells at least half inside the box on the named page, a row\'s cells joined by a space, rows by a newline', () => {
    const matches = regionText(synthetic(), onPage(1, 60, 775, 400, 815))
    expect(matches).toEqual([{ page: 1, text: 'Title\nLabel Value', cells: [cell(72, 800, 'Title'), cell(72, 780, 'Label'), cell(300, 780, 'Value')] }])
  })

  it('a box that only grazes a cell leaves it out; one covering more than half of it takes it', () => {
    // "Value" spans x 300..325: a box ending at 310 covers 40% of it, one ending at 315 covers 60%.
    expect(regionText(synthetic(), onPage(1, 60, 775, 310, 795))[0].text).toBe('Label')
    expect(regionText(synthetic(), onPage(1, 60, 775, 315, 795))[0].text).toBe('Label Value')
  })

  it('gives no match for a page where nothing sits in the box, and none for a page the document does not have', () => {
    expect(regionText(synthetic(), onPage(1, 400, 100, 500, 200))).toEqual([])
    expect(regionText(synthetic(), onPage(9, 0, 0, 595, 842))).toEqual([])
  })

  it('page=* reads the same box off every page, in page order: a footer per page', () => {
    const matches = regionText(synthetic(), onPage('*', 0, 30, 595, 60))
    expect(matches.map(match => [match.page, match.text])).toEqual([[1, 'Page 1 of 2'], [2, 'Page 2 of 2']])
  })

  it('reads the title line of the real fixture, outside any table, by the box around its own cell', () => {
    const page = discounts.pages[0]
    const title = page.rows.flatMap(row => row.cells).find(candidate => candidate.text.startsWith('DEALER DISCOUNTS'))
    if (title === undefined) throw new Error('the fixture lost its title line')
    const region = parseRegion(regionSelector(onPage(1, title.x - 2, title.y - 2, title.x + title.width + 2, title.y + title.height + 2)))

    expect(regionText(discounts, region)).toEqual([{ page: 1, text: title.text, cells: [title] }])
  })
})

describe('regionCells / isInsideRegion', () => {
  it('is the cells regionText reads, for one page, in row order', () => {
    const [page] = synthetic().pages
    expect(regionCells(page, onPage(1, 60, 775, 400, 815)).map(candidate => candidate.text)).toEqual(['Title', 'Label', 'Value'])
  })

  it('takes a zero-area cell by its position alone', () => {
    const page = { ...synthetic().pages[0], rows: [{ top: 10, bottom: 10, text: 'dot', cells: [cell(100, 100, 'dot', 0, 0)] }] }
    expect(regionCells(page, onPage(1, 90, 90, 110, 110))).toHaveLength(1)
    expect(regionCells(page, onPage(1, 110, 110, 120, 120))).toHaveLength(0)
  })

  it('is pure geometry: the same rule whichever way the document\'s y axis points', () => {
    const box = { x: 60, y: 30, width: 840, height: 60 }
    expect(isInsideRegion(box, { on: 'slide', at: 1, x1: 0, y1: 0, x2: 960, y2: 65 })).toBe(true)
    expect(isInsideRegion(box, { on: 'slide', at: 1, x1: 0, y1: 0, x2: 960, y2: 55 })).toBe(false)
  })
})
