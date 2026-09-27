import { defaultValue, validateDefaults } from './field-default.validator'

describe('defaultValue', () => {
  it('coerces the default to the field\'s type (#78)', () => {
    expect(defaultValue({ type: 'number', default: '0' }, 'f')).toBe(0)
    expect(defaultValue({ type: 'date', default: '2026-03-04T10:00:00Z' }, 'f')).toBe('2026-03-04')
    expect(defaultValue({ type: 'string', default: null }, 'f')).toBeNull()
  })

  it('refuses a default that breaks the field\'s rules', () => {
    expect(() => defaultValue({ type: 'integer', default: 0, min: 1 }, 'f')).toThrow('f: 0 is below the minimum 1')
    expect(() => defaultValue({ type: 'enum', values: ['a'], default: 'b' }, 'f')).toThrow('f: "b" is not one of a')
  })
})

describe('validateDefaults', () => {
  it('accepts defaults that fit their fields', () => {
    expect(validateDefaults({ n: { type: 'number', default: '1,5' }, b: { type: 'boolean', default: false, onMissing: 'default' } })).toEqual([])
  })

  it('reports a default that cannot be its field\'s type, members and items included (#78)', () => {
    expect(validateDefaults({
      price:    { type: 'number', default: 'free' },
      seller:   { type: 'object', fields: { rating: { type: 'integer', default: 9, max: 5 } } },
      variants: { type: 'array', items: { type: 'object', fields: { stock: { type: 'integer', default: 'many' } } } },
    })).toEqual([
      { path: 'fields.price.default', message: '"free" is not a valid default: number field: no number in "free"' },
      { path: 'fields.seller.fields.rating.default', message: '9 is not a valid default: 9 is above the maximum 5' },
      { path: 'fields.variants.items.fields.stock.default', message: '"many" is not a valid default: integer field: no number in "many"' },
    ])
  })

  it('reports onMissing "default" on a field without one, and an empty default on a required field (#78)', () => {
    expect(validateDefaults({ n: { type: 'number', onMissing: 'default' }, s: { type: 'string', required: true, default: '' } })).toEqual([
      { path: 'fields.n.onMissing', message: '"n" has onMissing "default" but no default' },
      { path: 'fields.s.default', message: 'a required field\'s default cannot be empty unless the field is nullable' },
    ])
  })
})
