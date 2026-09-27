import { bookHooks } from './book-hooks.js'

const context = { recipeId: 'books', scope: {}, log: () => {} }

describe('bookHooks', () => {
  it('turns a rating word into its number', () => {
    expect(bookHooks.stars('Three', {}, context)).toBe(3)
    expect(bookHooks.stars('Eleven', {}, context)).toBeUndefined()
  })

  it('decodes the entities a regex leaves in text cut out of markup', () => {
    expect(bookHooks.decodeHtml('Shakespeare&#39;s Sonnets', {}, context)).toBe("Shakespeare's Sonnets")
    expect(bookHooks.decodeHtml('Tom &amp; Jerry &#x2014; &quot;Classics&quot; &unknown;', {}, context)).toBe('Tom & Jerry — "Classics" &unknown;')
  })
})
