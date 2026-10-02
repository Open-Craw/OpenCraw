import type { GridSheetView } from '@opencraw/studio'
import { cellSelector, columnHeaderText, fillDownKeyFor, filledGridOf, gridCellCardNode, gridTableCardNode, isSingleCell, rangeText, rowPickText, sheetPattern, unionRange } from './grid-pick.mapper'
import type { GridDraft } from './grid-pick.mapper'

describe('sheetPattern', () => {
  it('anchors the sheet name at both ends, escaped', () => {
    expect(sheetPattern('Incentivi giugno')).toBe('^Incentivi giugno$')
    expect(sheetPattern('FZ 10.1')).toBe(String.raw`^FZ 10\.1$`)
  })

  it('matches only that exact sheet name, case-insensitively (core always compiles "sheet" case-insensitively)', () => {
    const pattern = new RegExp(sheetPattern('Maggio'), 'i')
    expect(pattern.test('maggio')).toBe(true)
    expect(pattern.test('Maggio 2')).toBe(false)
    expect(pattern.test('2 Maggio')).toBe(false)
  })
})

describe('rowPickText', () => {
  it('joins the non-empty cells\' own text, trimmed, with a space', () => {
    expect(rowPickText([{ value: ' Marca ' }, { value: 'Modello' }, { value: '' }])).toBe('Marca Modello')
  })

  it('reads a number/boolean cell as its own text', () => {
    expect(rowPickText([{ value: 'Total' }, { value: 42 }, { value: true }])).toBe('Total 42 true')
  })
})

function sheet (rows: (string | number | boolean)[][], merges: GridSheetView['merges'] = []): GridSheetView {
  return { name: 's', hidden: false, hiddenRows: [], columnCount: Math.max(0, ...rows.map(row => row.length)), rows: rows.map(row => row.map(value => ({ value, type: 'string' as const }))), merges }
}

describe('filledGridOf', () => {
  it('leaves an unmerged sheet\'s rows unchanged', () => {
    expect(filledGridOf(sheet([['a', 'b'], ['c', 'd']]))).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('copies a merge\'s top-left value into every cell it covers', () => {
    const grid = filledGridOf(sheet(
      [['Total', '', 'C'], ['x', 'y', 'z']],
      [{ ref: 'A1:B1', top: 0, left: 0, bottom: 0, right: 1 }],
    ))
    expect(grid[0]).toEqual(['Total', 'Total', 'C'])
  })

  it('does not mutate the sheet\'s own rows', () => {
    const s = sheet([['Total', '']], [{ ref: 'A1:B1', top: 0, left: 0, bottom: 0, right: 1 }])
    filledGridOf(s)
    expect(s.rows[0].map(cell => cell.value)).toEqual(['Total', ''])
  })
})

describe('columnHeaderText', () => {
  it('joins the distinct texts of the header rows at one column index', () => {
    const grid = [['Total', '', 'Electric', ''], ['', 'Share in %', '', 'Share in %']]
    expect(columnHeaderText(grid, [0, 1], 0)).toBe('Total')
    expect(columnHeaderText(grid, [0, 1], 1)).toBe('Share in %')
    expect(columnHeaderText(grid, [0, 1], 2)).toBe('Electric')
  })

  it('is "" for a column with no header text at all', () => {
    expect(columnHeaderText([['a']], [0], 5)).toBe('')
  })
})

describe('fillDownKeyFor', () => {
  it('resolves to the raw header text when no column has been named yet', () => {
    expect(fillDownKeyFor({}, 'Marca')).toBe('Marca')
  })

  it('resolves to the already-picked column\'s own key when one matches this header text', () => {
    const draft: GridDraft = { header: '^x', columns: { brand: '^Marca', model: '^Modello' } }
    expect(fillDownKeyFor(draft, 'Marca')).toBe('brand')
  })
})

describe('gridTableCardNode', () => {
  it('builds a table extract card from just a header pick', () => {
    const card = gridTableCardNode({ header: '^Marca Modello' }, 'steps.0')
    expect(card).toEqual({
      kind:     'card',
      path:     'steps.0',
      stepType: 'extract',
      sentence: [],
      custom:   false,
      step:     { type: 'extract', id: 'table', kind: 'table', selector: '^Marca Modello' },
    })
  })

  it('adds sheet, until, columns, headerRows (only above 1) and fillDown once picked', () => {
    const card = gridTableCardNode({
      sheet:      '^Incentivi giugno$',
      header:     '^Marca',
      headerRows: 2,
      until:      '^Consegna',
      columns:    { brand: '^Marca$' },
      fillDown:   ['brand'],
    }, 'steps.0')
    expect(card.step).toEqual({
      type: 'extract', id: 'table', kind: 'table', selector: '^Marca', sheet: '^Incentivi giugno$', until: '^Consegna', columns: { brand: '^Marca$' }, headerRows: 2, fillDown: ['brand'],
    })
  })

  it('leaves out headerRows when it is 1 (the default core already assumes)', () => {
    expect(gridTableCardNode({ header: '^Marca', headerRows: 1 }, 'steps.0').step).not.toHaveProperty('headerRows')
  })

  it('leaves out columns/fillDown when empty (nothing picked yet)', () => {
    const card = gridTableCardNode({ header: '^Marca', columns: {}, fillDown: [] }, 'steps.0')
    expect(card.step).not.toHaveProperty('columns')
    expect(card.step).not.toHaveProperty('fillDown')
  })

  it('throws when no header has been picked yet', () => {
    expect(() => gridTableCardNode({}, 'steps.0')).toThrow(/header row/)
  })

  it('takes a custom id', () => {
    expect(gridTableCardNode({ header: '^Marca' }, 'steps.0', 'listino').step.id).toBe('listino')
  })
})

describe('cellSelector / unionRange / isSingleCell / rangeText (issue #123)', () => {
  const sheet = { name: 'Prices', hidden: false, hiddenRows: [], columnCount: 3, merges: [], rows: [[{ value: 'Listino', type: 'string' as const }], [{ value: 'Modello', type: 'string' as const }, { value: 'Prezzo', type: 'string' as const }, { value: 'Sconto', type: 'string' as const }], [{ value: 'Panda', type: 'string' as const }, { value: 15_000, type: 'number' as const }, { value: 0.1, type: 'number' as const }]] }

  it('addresses one cell by the sheet\'s exact name and the row and column positions', () => {
    expect(cellSelector('Prices', { top: 2, left: 1, bottom: 2, right: 1 })).toBe("$.sheets[?(@.name=='Prices')].rows[2][1]")
  })

  it('addresses a rectangle as a slice of rows then of columns, ends exclusive as jsonpath slices are', () => {
    expect(cellSelector('Prices', { top: 1, left: 0, bottom: 2, right: 1 })).toBe("$.sheets[?(@.name=='Prices')].rows[1:3][0:2]")
    expect(cellSelector('Prices', { top: 1, left: 0, bottom: 1, right: 2 })).toBe("$.sheets[?(@.name=='Prices')].rows[1][0:3]")
  })

  it('quotes a sheet name holding a single quote with double quotes instead', () => {
    expect(cellSelector("Bob's", { top: 0, left: 0, bottom: 0, right: 0 })).toBe('$.sheets[?(@.name=="Bob\'s")].rows[0][0]')
  })

  it('the union of two ranges is the smallest rectangle holding both; one cell is single', () => {
    expect(unionRange({ top: 2, left: 1, bottom: 2, right: 1 }, { top: 0, left: 2, bottom: 0, right: 2 })).toEqual({ top: 0, left: 1, bottom: 2, right: 2 })
    expect(isSingleCell({ top: 2, left: 1, bottom: 2, right: 1 })).toBe(true)
    expect(isSingleCell({ top: 1, left: 1, bottom: 2, right: 1 })).toBe(false)
  })

  it('reads a range\'s values as stored, cells joined by a space and rows by a newline, a ragged row\'s missing cells skipped', () => {
    expect(rangeText(sheet, { top: 2, left: 1, bottom: 2, right: 1 })).toBe('15000')
    expect(rangeText(sheet, { top: 0, left: 0, bottom: 2, right: 1 })).toBe('Listino\nModello Prezzo\nPanda 15000')
  })
})

describe('gridCellCardNode', () => {
  it('builds a jsonpath card taking json, a list only for a rectangle', () => {
    const one = gridCellCardNode("$.sheets[?(@.name=='Prices')].rows[2][1]", 'steps.1', 'panda', false)
    expect(one.step).toEqual({ type: 'extract', id: 'panda', kind: 'jsonpath', selector: "$.sheets[?(@.name=='Prices')].rows[2][1]", take: 'json' })
    expect(gridCellCardNode('$.sheets[0].rows[1:3][0:2]', 'steps.1', 'modelloPrezzo', true).step.many).toBe(true)
  })
})
