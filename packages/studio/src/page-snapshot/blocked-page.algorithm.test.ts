import { blockedPageNotice } from './blocked-page.algorithm'

describe('blockedPageNotice', () => {
  it.each([
    'www.example.co.uk\nPerforming security verification\nThis website uses a security service to protect against malicious bots.',
    'Just a moment...\nChecking your browser before accessing the site.',
    'Access Denied\nYou don\'t have permission to access this page.',
    'Pardon Our Interruption\nAs you were browsing something about your browser made us think you were a bot.',
  ])('recognises a bot check or an access-denied page: %s', (text) => {
    expect(blockedPageNotice(text)).toMatch(/turned the Studio's browser away/)
  })

  it('leaves a page that is a page alone, even one that talks about security', () => {
    expect(blockedPageNotice('Quotes to Scrape\nLogin\n“The world as we have created it is a process of our thinking.”')).toBeUndefined()
    expect(blockedPageNotice('Our security policy\nWe take the security of your data seriously.')).toBeUndefined()
  })

  it('takes a 403 or a 429 for a refusal when the page is small, but not when it is a whole page', () => {
    expect(blockedPageNotice('Forbidden', 403)).toBeDefined()
    expect(blockedPageNotice('x'.repeat(5000), 403)).toBeUndefined()
  })
})
