import type { GridSheetView } from '@opencraw/studio'
import { columnHeaderText, fillDownKeyFor, filledGridOf, gridTableCardNode, rowPickText, sheetPattern } from './grid-pick.mapper'
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
