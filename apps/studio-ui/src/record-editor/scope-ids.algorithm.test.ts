import { scopeIdsOf } from './scope-ids.algorithm'

describe('scopeIdsOf', () => {
  it('is empty for a recipe with no steps', () => {
    expect(scopeIdsOf({})).toEqual([])
    expect(scopeIdsOf(undefined)).toEqual([])
  })

  it('collects top-level step ids', () => {
    const recipe = { steps: [{ type: 'request', id: 'list' }, { type: 'extract', id: 'items' }] }
    expect(scopeIdsOf(recipe)).toEqual(['list', 'items'])
  })

  it('collects a forEach\'s "as" and walks into its body', () => {
    const recipe = {
      steps: [
        { type: 'extract', id: 'items' },
        { type: 'forEach', as: 'item', steps: [{ type: 'extract', id: 'price', from: 'item' }] },
      ],
    }
    expect(scopeIdsOf(recipe)).toEqual(['items', 'item', 'price'])
  })

  it('walks into an "if" step\'s else branch too', () => {
    const recipe = {
      steps: [{ type: 'if', when: '{{x}}', steps: [{ type: 'extract', id: 'a' }], else: [{ type: 'extract', id: 'b' }] }],
    }
    expect(scopeIdsOf(recipe)).toEqual(['a', 'b'])
  })

  it('drops duplicate ids', () => {
    const recipe = { steps: [{ type: 'forEach', as: 'item', steps: [] }, { type: 'forEach', as: 'item', steps: [] }] }
    expect(scopeIdsOf(recipe)).toEqual(['item'])
  })
})
