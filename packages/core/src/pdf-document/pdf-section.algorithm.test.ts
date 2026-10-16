import type { PdfDocument, PdfRow } from './pdf-document.model'
import { marginRows } from './pdf-margins.algorithm'
import { findSections } from './pdf-section.algorithm'

function row (y: number, height: number, ...texts: string[]): PdfRow {
  const cells = texts.map((text, index) => ({ x: 78 + index * 100, y, width: 50, height, text }))

  return { top: y + height, bottom: y, cells, text: texts.join('\t') }
}

function pdf (...pages: PdfRow[][]): PdfDocument {
  return { kind: 'pdf', pages: pages.map((rows, index) => ({ number: index + 1, width: 612, height: 792, rows })) }
}

const SHORT = pdf([row(690, 24, 'OFFICIAL SHEET:'), row(668, 24, 'CityCompact Eco'), row(609, 16, 'Details'), row(591, 10, 'Compact urban profile.'), row(567, 10, 'Cloth upholstery.'), row(512, 16, 'Price'), row(494, 10, 'Base MSRP: 18,500.')])
const LONG = pdf([row(690, 24, 'OFFICIAL SHEET:'), row(668, 24, 'Hyperion EV'), row(609, 16, 'Details'), row(591, 10, 'Premium all-electric SUV platform'), row(577, 10, 'configurations.'), row(553, 10, 'Adaptive air suspension.'), row(515, 10, 'Matrix LED lighting.'), row(356, 16, 'Price'), row(338, 10, 'Base MSRP: 54,200.')])

describe('findSections', () => {
  it('reads the text between a heading and the next heading, whichever page height it ends at', () => {
    expect(findSections(SHORT, { heading: /^Details$/i })[0]?.text).toBe('Compact urban profile.\nCloth upholstery.')
    expect(findSections(LONG, { heading: /^Details$/i })[0]?.text).toBe('Premium all-electric SUV platform configurations.\nAdaptive air suspension.\nMatrix LED lighting.')
  })

  it('keeps the printed lines of a body apart, the lines of a wrapped paragraph too', () => {
    expect(findSections(LONG, { heading: /^Details$/i })[0]?.lines).toEqual(['Premium all-electric SUV platform', 'configurations.', 'Adaptive air suspension.', 'Matrix LED lighting.'])
  })

  it('reads the last section to the end of the document', () => {
    expect(findSections(LONG, { heading: /^Price$/i })[0]?.text).toBe('Base MSRP: 54,200.')
  })

  it('ends at the row `until` matches', () => {
    expect(findSections(LONG, { heading: /^Details$/i, until: /^Matrix/ })[0]?.text).toBe('Premium all-electric SUV platform configurations.\nAdaptive air suspension.')
  })

  it('joins wrapped lines with a space and keeps paragraphs apart', () => {
    const [match] = findSections(LONG, { heading: /details/i })

    expect(match?.text.split('\n')).toHaveLength(3)
    expect(match?.heading).toBe('Details')
    expect(match?.page).toBe(1)
  })

  it('finds nothing for a heading the document does not have, or one with no body', () => {
    expect(findSections(SHORT, { heading: /^Warranty$/i })).toEqual([])
    const headingsOnly = pdf([row(700, 16, 'Details'), row(680, 16, 'Price')])

    expect(findSections(headingsOnly, { heading: /^Details$/ })).toEqual([])
  })

  it('carries a section over a page break, with its paragraphs apart', () => {
    const paged = pdf([row(700, 16, 'Details'), row(680, 10, 'First page text.')], [row(700, 10, 'Second page text.')])

    expect(findSections(paged, { heading: /^Details$/ })[0]?.text).toBe('First page text.\nSecond page text.')
  })

  it('leaves the running header and footer out of a section that runs over a page break when asked to, and keeps them otherwise', () => {
    const paged = pdf(
      [row(760, 9, 'ACME Annual report'), row(700, 16, 'Details'), row(680, 10, 'The first sentence ends here.'), row(666, 10, 'A second sentence runs on to'), row(40, 9, 'Page 1 of 2')],
      [row(760, 9, 'ACME Annual report'), row(740, 10, 'the next page, and stops.'), row(700, 16, 'Price'), row(680, 10, '99.'), row(40, 9, 'Page 2 of 2')],
    )

    expect(findSections(paged, { heading: /^Details$/, ignoreHeadersFooters: true })[0]?.text).toBe('The first sentence ends here. A second sentence runs on to the next page, and stops.')
    expect(findSections(paged, { heading: /^Details$/ })[0]?.text).toContain('Page 1 of 2')
  })
})

describe('marginRows', () => {
  it('finds rows repeated at the same height on several pages, page numbers included, and no others', () => {
    const header = row(760, 9, 'ACME Annual report')
    const doc = pdf([header, row(400, 10, 'Body'), row(40, 9, 'Page 1 of 2')], [row(760, 9, 'ACME Annual report'), row(400, 10, 'Body'), row(40, 9, 'Page 2 of 2')])
    const margins = marginRows(doc)

    expect(margins.size).toBe(4)
    expect(margins.has(header)).toBe(true)
  })

  it('finds nothing in a one-page document', () => {
    const single = pdf([row(760, 9, 'Title'), row(40, 9, 'Footer')])

    expect(marginRows(single).size).toBe(0)
  })
})

describe('findSections in a two-column layout', () => {
  /** A row of two cells side by side, as pdf.js reads two columns of prose on the same baselines. */
  function twoColumns (y: number, left: string | undefined, right: string | undefined): PdfRow {
    const cells = [
      ...(left === undefined ? [] : [{ x: 51, y, width: 230, height: 10, text: left }]),
      ...(right === undefined ? [] : [{ x: 306, y, width: 230, height: 10, text: right }]),
    ]

    return { top: y + 10, bottom: y, cells, text: cells.map(cell => cell.text).join(String.fromCodePoint(9)) }
  }

  const doc = pdf([
    row(700, 14, 'Details'),
    twoColumns(680, 'The provider shall oversee all', 'discrepancy logging will execute'),
    twoColumns(666, 'intermodal transfers and', 'automatically when weight deviates.'),
    twoColumns(652, 'secure storage.', undefined),
    twoColumns(630, undefined, 'Third-party audits may occur.'),
    row(500, 14, 'Price'),
    row(480, 10, '$1'),
  ])

  it('reads the left column through, then the right, with wrapped lines joined', () => {
    expect(findSections(doc, { heading: /^Details$/ })[0]?.text).toBe('The provider shall oversee all intermodal transfers and secure storage.\ndiscrepancy logging will execute automatically when weight deviates.\nThird-party audits may occur.')
  })
})

describe('findSections paragraphs', () => {
  it('starts a paragraph at each numbered item and joins a word broken at a hyphen without a space', () => {
    const doc = pdf([row(700, 14, 'Terms'), row(680, 10, '1. Payment is due net 30 days.'), row(666, 10, '2. Special handling for temperature-'), row(652, 10, 'sensitive shipments applies.')])

    expect(findSections(doc, { heading: /^Terms$/ })[0]?.text).toBe('1. Payment is due net 30 days.\n2. Special handling for temperature-sensitive shipments applies.')
  })
})
