import { hintFor } from './item-hint.algorithm'

describe('hintFor', () => {
  it('is undefined without a scope or a bound id', () => {
    expect(hintFor(undefined, 'item')).toBeUndefined()
    expect(hintFor({ item: {} }, undefined)).toBeUndefined()
  })

  it('is undefined when the id is not in scope', () => {
    expect(hintFor({ vars: {} }, 'item')).toBeUndefined()
  })

  it('lists an object value\'s keys', () => {
    expect(hintFor({ item: { name: 'Bulbasaur', ability: null } }, 'item')).toBe('"item" has: name, ability')
  })

  it('reports a list\'s length', () => {
    expect(hintFor({ items: [1, 2, 3] }, 'items')).toBe('"items" is a list of 3, not a single value')
  })

  it('is undefined for an empty object or list, and for a scalar', () => {
    expect(hintFor({ item: {} }, 'item')).toBeUndefined()
    expect(hintFor({ items: [] }, 'items')).toBeUndefined()
    expect(hintFor({ name: 'x' }, 'name')).toBeUndefined()
  })
})
