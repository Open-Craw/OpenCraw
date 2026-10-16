import { OdfTable } from './odf-table.model'

function fill (table: OdfTable, rows: { attributes?: Record<string, string>, cells: { attributes?: Record<string, string>, text?: string }[] }[]): void {
  for (const row of rows) {
    table.openRow(row.attributes ?? {})
    for (const cell of row.cells) {
      table.openCell(cell.attributes ?? {})
      if (cell.text !== undefined) table.addParagraph(cell.text)
      table.closeCell()
    }
    table.closeRow()
  }
}

describe('OdfTable', () => {
  it('collects rows of cell texts, joining a cell\'s paragraphs and trimming', () => {
    const table = new OdfTable()
    fill(table, [{ cells: [{ text: ' a ' }, { text: 'b' }] }, { cells: [{ text: 'c' }, {}] }])

    expect(table.rows).toEqual([['a', 'b'], ['c', '']])
    expect(table.merges).toEqual([])
  })

  it('records merged ranges, the covered cells staying in the grid as empty text', () => {
    const table = new OdfTable()
    fill(table, [
      { cells: [{ attributes: { 'table:number-columns-spanned': '2', 'table:number-rows-spanned': '2' }, text: 'Title' }, { text: 'covered' }, { text: 'x' }] },
      { cells: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
    ])

    expect(table.merges).toEqual(['A1:B2'])
  })

  it('repeats a cell or a row as many times as the file says, up to a limit', () => {
    const table = new OdfTable()
    fill(table, [
      { attributes: { 'table:number-rows-repeated': '2' }, cells: [{ attributes: { 'table:number-columns-repeated': '3' }, text: 'x' }] },
      { attributes: { 'table:number-rows-repeated': '999999' }, cells: [{ attributes: { 'table:number-columns-repeated': '999999' } }] },
    ])

    expect(table.rows.slice(0, 2)).toEqual([['x', 'x', 'x'], ['x', 'x', 'x']])
    expect(table.rows).toHaveLength(2 + 1024)
    expect(table.rows[2]).toHaveLength(1024)
  })

  it('says whether a cell is open, and gives its text for the cell a table is nested in', () => {
    const table = new OdfTable()
    table.openRow({})
    expect(table.inCell).toBe(false)
    table.openCell({})
    expect(table.inCell).toBe(true)
    table.addParagraph('one')
    table.closeCell()
    table.openCell({})
    table.closeCell()
    table.closeRow()

    expect(table.text).toBe('one')
  })
})
