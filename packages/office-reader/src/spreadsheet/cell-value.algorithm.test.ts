import { textValue, typedValue } from './cell-value.algorithm'
import type { StoredCell } from './cell-value.algorithm'

const context = { sharedStrings: ['zero', 'one'], date1904: false }

function cell (value: string, type = 'n', format: StoredCell['format'] = 'number'): StoredCell {
  return { type, value, format }
}

describe('typedValue', () => {
  it('reads each cell type', () => {
    expect(typedValue(cell('1', 's'), context)).toBe('one')
    expect(typedValue(cell('x', 'str'), context)).toBe('x')
    expect(typedValue(cell('1', 'b'), context)).toBe(true)
    expect(typedValue(cell('#N/A', 'e'), context)).toEqual({ error: '#N/A' })
    expect(typedValue(cell('2026-06-01T09:30:00', 'd'), context)).toEqual(new Date('2026-06-01T09:30:00Z'))
    expect(typedValue(cell('78.599999999999994'), context)).toBe(78.6)
    expect(typedValue(cell(''), context)).toBeNull()
  })

  it('reads serial dates as wall-clock UTC, rounded to the second, in both date systems', () => {
    expect(typedValue(cell('46174', 'n', 'date'), context)).toEqual(new Date('2026-06-01T00:00:00Z'))
    expect(typedValue(cell('46174.395833333336', 'n', 'date'), context)).toEqual(new Date('2026-06-01T09:30:00Z'))
    expect(typedValue(cell('44712', 'n', 'date'), { ...context, date1904: true })).toEqual(new Date('2026-06-01T00:00:00Z'))
    // 1900 counts a 29 February that never was: serials before it are a day early.
    expect(typedValue(cell('1', 'n', 'date'), context)).toEqual(new Date('1900-01-01T00:00:00Z'))
    expect(typedValue(cell('59', 'n', 'date'), context)).toEqual(new Date('1900-02-28T00:00:00Z'))
    expect(typedValue(cell('61', 'n', 'date'), context)).toEqual(new Date('1900-03-01T00:00:00Z'))
  })

  it('reads serial 60 in the 1900 system as the text Excel shows, 1900-02-29, a day no Date holds', () => {
    expect(typedValue(cell('60', 'n', 'date'), context)).toBe('1900-02-29')
    expect(typedValue(cell('60.75', 'n', 'date'), context)).toBe('1900-02-29T18:00:00')
    expect(textValue(cell('60', 'n', 'date'), context)).toBe('1900-02-29')
    expect(typedValue(cell('60.9999999999', 'n', 'date'), context)).toEqual(new Date('1900-03-01T00:00:00Z'))
    // In the 1904 system, 60 is an ordinary day; as a plain number, an ordinary number.
    expect(typedValue(cell('60', 'n', 'date'), { ...context, date1904: true })).toEqual(new Date('1904-03-01T00:00:00Z'))
    expect(typedValue(cell('60'), context)).toBe(60)
  })
})

describe('textValue', () => {
  it('writes canonical text', () => {
    expect(textValue(cell('0.125'), context)).toBe('0.125')
    expect(textValue(cell('1e21'), context)).toBe('1e+21')
    expect(textValue(cell('46174', 'n', 'date'), context)).toBe('2026-06-01')
    expect(textValue(cell('46174.5', 'n', 'date'), context)).toBe('2026-06-01T12:00:00')
    expect(textValue(cell('0.5', 'n', 'time'), context)).toBe('12:00:00')
    expect(textValue(cell('0.5', 'n', 'time'), { ...context, date1904: true })).toBe('12:00:00')
    expect(textValue(cell('1.5', 'n', 'time'), { ...context, date1904: true })).toBe('1904-01-02T12:00:00')
    expect(textValue(cell('0', 'b'), context)).toBe('false')
    expect(textValue(cell('#REF!', 'e'), context)).toBe('#REF!')
    expect(textValue(cell(''), context)).toBe('')
  })
})
