import { snapshotViewSchema } from './snapshot-view.contract'

describe('snapshotViewSchema', () => {
  it('accepts a rewritten snapshot', () => {
    expect(snapshotViewSchema.safeParse({ html: '<html></html>', nodeCount: 3, baseUrl: 'https://example.com/' }).success).toBe(true)
  })

  it('rejects a response missing a field', () => {
    expect(snapshotViewSchema.safeParse({ html: '<html></html>', nodeCount: 3 }).success).toBe(false)
  })
})
