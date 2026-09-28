import { isStableClassToken, sameClassSignature, stableClasses } from './class-token.policy'

describe('isStableClassToken', () => {
  it('accepts hand-authored classes', () => {
    expect(isStableClassToken('product_pod')).toBe(true)
    expect(isStableClassToken('price_color')).toBe(true)
    expect(isStableClassToken('btn-primary')).toBe(true)
  })

  it('rejects styled-components/emotion tokens', () => {
    expect(isStableClassToken('sc-bdVaJa')).toBe(false)
    expect(isStableClassToken('css-1x2y3z4')).toBe(false)
  })

  it('rejects CSS-module hash suffixes', () => {
    expect(isStableClassToken('wrapper__3fA9k')).toBe(false)
    expect(isStableClassToken('Button-module_root__aB3dK')).toBe(false)
  })

  it('rejects JSS-shaped and purely numeric tokens', () => {
    expect(isStableClassToken('jss42')).toBe(false)
    expect(isStableClassToken('1829371')).toBe(false)
  })

  it('rejects a bare hex hash', () => {
    expect(isStableClassToken('a3f9c21')).toBe(false)
  })

  it('rejects an empty token', () => {
    expect(isStableClassToken('')).toBe(false)
  })
})

describe('stableClasses', () => {
  it('keeps only the stable tokens, in order', () => {
    expect(stableClasses(['product_pod', 'css-1x2y3z4', 'title', 'jss42'])).toEqual(['product_pod', 'title'])
  })
})

describe('sameClassSignature', () => {
  it('is true when the stable classes match, generated tokens ignored', () => {
    expect(sameClassSignature(['product_pod', 'css-1x2y3z4'], ['product_pod', 'css-9k8j7h6'])).toBe(true)
  })

  it('is false when the stable classes differ', () => {
    expect(sameClassSignature(['product_pod'], ['other_pod'])).toBe(false)
    expect(sameClassSignature(['product_pod', 'featured'], ['product_pod'])).toBe(false)
  })

  it('ignores order', () => {
    expect(sameClassSignature(['a', 'b'], ['b', 'a'])).toBe(true)
  })
})
