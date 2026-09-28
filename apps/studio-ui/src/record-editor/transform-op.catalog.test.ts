import { optionFieldsOf, TRANSFORM_OPS } from './transform-op.catalog'

describe('TRANSFORM_OPS', () => {
  it('never includes hook: out of scope for this phase (custom, non-editable block)', () => {
    expect(TRANSFORM_OPS).not.toContain('hook')
  })
})

describe('optionFieldsOf', () => {
  it('is empty for an op with no options', () => {
    expect(optionFieldsOf('trim')).toEqual([])
    expect(optionFieldsOf('first')).toEqual([])
  })

  it('lists a currency transform\'s options', () => {
    expect(optionFieldsOf('currency')).toEqual([{ name: 'locale' }, { name: 'currency' }])
  })

  it('marks a numeric option field', () => {
    expect(optionFieldsOf('nth')).toEqual([{ name: 'index', numeric: true }])
  })

  it('is empty for an op not in the catalog', () => {
    expect(optionFieldsOf('not-a-real-op')).toEqual([])
  })
})
