import { findGridTables } from './grid-table.algorithm'
import { htmlTableSheets } from './html-tables.mapper'

describe('htmlTableSheets', () => {
  it('reads colspan and rowspan as merged ranges, thead and tbody alike', () => {
    const [table] = htmlTableSheets(`<table>
      <thead><tr><th rowspan="2">Model</th><th colspan="2">Price</th></tr><tr><th>List</th><th>Net</th></tr></thead>
      <tbody><tr><td rowspan="2">Pandina</td><td>15.950</td><td>13.955</td></tr><tr><td>17.950</td><td>15.706</td></tr></tbody>
    </table>`)
    expect(table).toEqual({
      name:   'table 1',
      rows:   [['Model', 'Price', ''], ['', 'List', 'Net'], ['Pandina', '15.950', '13.955'], ['', '17.950', '15.706']],
      merges: ['A1:A2', 'B1:C1', 'A3:A4'],
    })
    const [read] = findGridTables({ kind: 'workbook', sheets: [table] }, { header: /^Model Price/i, headerRows: 2 })
    expect(read.rows).toEqual([{ 'Model': 'Pandina', 'Price List': '15.950', 'Price Net': '13.955' }, { 'Model': 'Pandina', 'Price List': '17.950', 'Price Net': '15.706' }])
  })

  it('reads a nested table as its own sheet, and not as its parent\'s rows', () => {
    const tables = htmlTableSheets('<table><tr><td>outer <table><tr><td>inner</td></tr></table></td></tr><tr><td>second</td></tr></table>')
    expect(tables.map(table => [table.name, table.rows.length])).toEqual([['table 1', 2], ['table 2', 1]])
    expect(tables[1].rows).toEqual([['inner']])
  })

  it('keeps a line break or a paragraph inside a cell as a space (#72)', () => {
    const [table] = htmlTableSheets(`<table>
      <tr><th>Population</th><th><p>FM Classes</p><p>A, B1 &amp; C3</p></th></tr>
      <tr><td>&lt;=10,000</td><td>2659<br>$560</td></tr>
      <tr><td>more</td><td><div>2663</div><div>$615</div></td></tr>
      <tr><td>inline</td><td><b>Fee</b> <i>due</i>: $1,<span>200</span></td></tr>
    </table>`)
    expect(table.rows).toEqual([['Population', 'FM Classes A, B1 & C3'], ['<=10,000', '2659 $560'], ['more', '2663 $615'], ['inline', 'Fee due: $1,200']])
  })
})
