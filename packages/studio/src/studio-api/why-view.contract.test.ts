import { whyViewSchema } from './why-view.contract'

describe('whyViewSchema', () => {
  it('accepts a missing explanation with a step path and policy', () => {
    const view = { sentence: '"price" is missing.', field: 'price', recipeId: 'books', outcome: 'missing', stepPath: 'steps.1', policy: 'null' }
    expect(whyViewSchema.safeParse(view).success).toBe(true)
  })

  it('accepts a rejected explanation with a reason', () => {
    const view = { sentence: '"price" was rejected: not a number.', field: 'price', recipeId: 'books', outcome: 'rejected', reason: 'not a number' }
    expect(whyViewSchema.safeParse(view).success).toBe(true)
  })

  it('rejects an unknown outcome', () => {
    const view = { sentence: 'x', field: 'price', recipeId: 'books', outcome: 'nope' }
    expect(whyViewSchema.safeParse(view).success).toBe(false)
  })
})
