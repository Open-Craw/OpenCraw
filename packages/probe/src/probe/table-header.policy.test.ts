import { isDataRow, isFigure, isHeaderRow } from './table-header.policy'

describe('isFigure', () => {
  it('counts amounts, codes and years as figures', () => {
    for (const cell of ['126', '2,820', '$560', '2659 $560', '(£0.58m)', '2026', '<=10,000', '10,001 – 25,000', '-3 days', '1.0 Hybrid']) expect([cell, isFigure(cell)]).toEqual([cell, true])
  })

  it('counts words that contain digits as words (#73)', () => {
    for (const cell of ['FY26 Lodging Rate', 'FY26 M&IE', 'FM Classes A, B1 & C3', 'RESIDENT POPULATION (APRIL 1, 2020)', 'Prezzo €', 'Model']) expect([cell, isFigure(cell)]).toEqual([cell, false])
  })
})

describe('isHeaderRow and isDataRow', () => {
  it('needs two cells, and no figure for a header or one for data', () => {
    expect(isHeaderRow(['ID', 'STATE', 'FY26 Lodging Rate'])).toBe(true)
    expect(isHeaderRow(['Indicator', '2026'])).toBe(false)
    expect(isHeaderRow(['Title only'])).toBe(false)
    expect(isDataRow(['AL', 'Birmingham', '126'])).toBe(true)
    expect(isDataRow(['Capital Programme', 'On track', 'Green'])).toBe(false)
  })
})
