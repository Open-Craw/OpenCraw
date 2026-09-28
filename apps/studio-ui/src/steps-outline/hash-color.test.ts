import { hashColor } from './hash-color'

describe('hashColor', () => {
  it('gives the same name the same colour every time', () => {
    expect(hashColor('books')).toBe(hashColor('books'))
  })

  it('gives different names different colours (almost always)', () => {
    expect(hashColor('books')).not.toBe(hashColor('book'))
    expect(hashColor('page')).not.toBe(hashColor('vars'))
  })

  it('always returns a well-formed hsl() string', () => {
    expect(hashColor('anything')).toMatch(/^hsl\(\d+, 65%, 42%\)$/)
  })
})
