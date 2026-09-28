import { verifySelectorViewSchema } from './verify-selector-view.contract'

describe('verifySelectorViewSchema', () => {
  it('accepts a fully checked verification', () => {
    expect(verifySelectorViewSchema.safeParse({ selector: '.price', snapshotMatches: 3, liveChecked: true, liveMatches: 3 }).success).toBe(true)
  })

  it('accepts liveChecked: false with no liveMatches, plus a reason', () => {
    expect(verifySelectorViewSchema.safeParse({ selector: '.price', snapshotMatches: 3, liveChecked: false, liveError: 'host not allowed' }).success).toBe(true)
  })

  it('rejects a response missing the snapshot count', () => {
    expect(verifySelectorViewSchema.safeParse({ selector: '.price', liveChecked: true }).success).toBe(false)
  })
})
