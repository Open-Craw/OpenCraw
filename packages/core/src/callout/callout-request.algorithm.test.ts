import { hookRequest } from './callout-request.algorithm'

const context = { recipeId: 'books', scope: { a: 1 }, log: () => undefined }
const keyOf = (input: unknown, args = {}, name = 'slug'): string => hookRequest(name, input, args, context).idempotencyKey

describe('hookRequest', () => {
  it('gives the same key to the same call and a different one when anything about it differs', () => {
    expect(keyOf('a')).toBe(keyOf('a'))
    expect(keyOf('a')).not.toBe(keyOf('b'))
    expect(keyOf('a', { n: 1 })).not.toBe(keyOf('a', { n: 2 }))
    expect(keyOf('a', {}, 'other')).not.toBe(keyOf('a'))
  })

  it('leaves out the input of a hook step', () => {
    expect('input' in hookRequest('slug', undefined, {}, context)).toBe(false)
  })
})
