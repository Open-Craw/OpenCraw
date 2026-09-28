import { looksLikeNextLink, paginateStepFor } from './next-link.policy'

describe('looksLikeNextLink', () => {
  it('matches rel="next"', () => {
    expect(looksLikeNextLink({ rel: 'next' }, 'a.pager')).toBe(true)
    expect(looksLikeNextLink({ rel: 'nofollow next' }, 'a.pager')).toBe(true)
  })

  it('matches an aria-label of "Next"', () => {
    expect(looksLikeNextLink({ ariaLabel: 'Next' }, 'a.pager')).toBe(true)
  })

  it('matches link text reading "next", loosely (an arrow, "page", case)', () => {
    expect(looksLikeNextLink({ text: 'Next' }, 'a')).toBe(true)
    expect(looksLikeNextLink({ text: 'next »' }, 'a')).toBe(true)
    expect(looksLikeNextLink({ text: 'Next page' }, 'a')).toBe(true)
  })

  it('matches the selector shape itself: li.next a, a[aria-label=Next]', () => {
    expect(looksLikeNextLink(undefined, 'li.next > a')).toBe(true)
    expect(looksLikeNextLink(undefined, 'a[aria-label="Next"]')).toBe(true)
  })

  it('does not match an unrelated link', () => {
    expect(looksLikeNextLink({ text: 'View details' }, 'a.product-link')).toBe(false)
    expect(looksLikeNextLink(undefined, 'a.product-link')).toBe(false)
  })
})

describe('paginateStepFor', () => {
  it('builds a paginate step with next.selector and an empty body', () => {
    expect(paginateStepFor('li.next a')).toEqual({ type: 'paginate', next: { selector: 'li.next a' }, steps: [] })
  })
})
