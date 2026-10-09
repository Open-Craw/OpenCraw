import { optionFieldsOf, TRANSFORM_OPS } from './transform-op.catalog'

describe('TRANSFORM_OPS', () => {
  it('never includes hook: the chain offers it on its own, with a name picker instead of an options form', () => {
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

  it('lists padStart/padEnd\'s options', () => {
    expect(optionFieldsOf('padStart')).toEqual([{ name: 'length', numeric: true }, { name: 'char' }])
    expect(optionFieldsOf('padEnd')).toEqual([{ name: 'length', numeric: true }, { name: 'char' }])
    expect(TRANSFORM_OPS).toEqual(expect.arrayContaining(['toString', 'padStart', 'padEnd']))
  })

  it('is empty for an op not in the catalog', () => {
    expect(optionFieldsOf('not-a-real-op')).toEqual([])
  })
})
