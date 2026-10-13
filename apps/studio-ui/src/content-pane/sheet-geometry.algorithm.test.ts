import { columnName, sheetGeometry } from './sheet-geometry.algorithm'

describe('columnName', () => {
  it('names columns like a spreadsheet', () => {
    expect([0, 25, 26, 27, 701, 702].map(index => columnName(index))).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA'])
  })
})

describe('sheetGeometry', () => {
  it('sizes columns and rows from the file, falling back to the defaults', () => {
    const geometry = sheetGeometry({ columnWidths: { 1: 20 }, rowHeights: { 0: 30 }, defaultColumnWidth: 10, defaultRowHeight: 15 }, 3, 2)
    expect(geometry.columnLefts).toEqual([0, 70, 210, 280])
    expect(geometry.rowTops).toEqual([0, 40, 60])
  })

  it('uses fixed sizes for a sheet that stores none (a CSV)', () => {
    const geometry = sheetGeometry({}, 2, 1)
    expect(geometry.columnLefts).toEqual([0, 64, 128])
    expect(geometry.rowTops).toEqual([0, 24])
  })
})
