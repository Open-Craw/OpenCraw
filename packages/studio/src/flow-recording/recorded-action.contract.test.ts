import { rawActionSchema } from './recorded-action.contract'

const html = '<html><body></body></html>'

describe('rawActionSchema', () => {
  it('accepts one of every kind the in-page script reports', () => {
    expect(rawActionSchema.safeParse({ kind: 'click', nodeId: 'n1', html }).success).toBe(true)
    expect(rawActionSchema.safeParse({ kind: 'click', nodeId: 'n1', html, link: { rel: 'next', text: 'Next' } }).success).toBe(true)
    expect(rawActionSchema.safeParse({ kind: 'fill', nodeId: 'n2', html, value: 'demo', field: { type: 'text', name: 'user' } }).success).toBe(true)
    expect(rawActionSchema.safeParse({ kind: 'select', nodeId: 'n3', html, value: 'IT' }).success).toBe(true)
    expect(rawActionSchema.safeParse({ kind: 'keypress', key: 'Enter' }).success).toBe(true)
    expect(rawActionSchema.safeParse({ kind: 'keypress', nodeId: 'n4', html, key: 'Enter' }).success).toBe(true)
    expect(rawActionSchema.safeParse({ kind: 'scroll', to: 'bottom' }).success).toBe(true)
    expect(rawActionSchema.safeParse({ kind: 'unsupported', reason: 'iframe' }).success).toBe(true)
    expect(rawActionSchema.safeParse({ kind: 'unsupported', reason: 'shadow-dom' }).success).toBe(true)
  })

  it('rejects a click with no nodeId/html, and an unknown kind/reason', () => {
    expect(rawActionSchema.safeParse({ kind: 'click' }).success).toBe(false)
    expect(rawActionSchema.safeParse({ kind: 'click', nodeId: 'n1' }).success).toBe(false) // html is required: it is how the selector is resolved without a later, racy page.content()
    expect(rawActionSchema.safeParse({ kind: 'teleport' }).success).toBe(false)
    expect(rawActionSchema.safeParse({ kind: 'unsupported', reason: 'other' }).success).toBe(false)
  })

  it('never carries a raw secret value field name on its own — a fill\'s value is just a string, opaque to the schema itself', () => {
    const parsed = rawActionSchema.parse({ kind: 'fill', nodeId: 'n1', html, value: 'hunter2', field: { type: 'password' } })
    expect(parsed).toEqual({ kind: 'fill', nodeId: 'n1', html, value: 'hunter2', field: { type: 'password' } })
  })
})
