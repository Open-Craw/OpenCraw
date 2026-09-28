import { inferSelectorViewSchema } from './infer-selector-view.contract'

describe('inferSelectorViewSchema', () => {
  it('accepts a field result (one pick)', () => {
    const value = { kind: 'field', field: { selector: '.price_color', tier: 'class', take: 'text', matches: 3 } }
    expect(inferSelectorViewSchema.safeParse(value).success).toBe(true)
  })

  it('accepts a list result (two picks)', () => {
    const value = {
      kind:  'list',
      item:  { selector: 'article.product_pod', tier: 'class', matches: 3 },
      field: { selector: '.price_color', tier: 'class', take: 'text', matches: 1 },
    }
    expect(inferSelectorViewSchema.safeParse(value).success).toBe(true)
  })

  it('accepts an unsupported result with a reason', () => {
    expect(inferSelectorViewSchema.safeParse({ kind: 'unsupported', reason: 'shadow DOM is not supported' }).success).toBe(true)
  })

  it('rejects an unknown kind', () => {
    expect(inferSelectorViewSchema.safeParse({ kind: 'nope' }).success).toBe(false)
  })
})
