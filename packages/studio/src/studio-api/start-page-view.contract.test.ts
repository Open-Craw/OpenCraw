import { startPageViewSchema } from './start-page-view.contract'

describe('startPageViewSchema', () => {
  it('accepts a page of HTML text', () => {
    expect(startPageViewSchema.safeParse({ html: '<html></html>' }).success).toBe(true)
  })

  it('rejects a response with no html', () => {
    expect(startPageViewSchema.safeParse({}).success).toBe(false)
  })
})
