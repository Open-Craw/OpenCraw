import { isMissingBrowserError } from './missing-browser.policy'

describe('isMissingBrowserError', () => {
  it('recognises Playwright\'s "executable doesn\'t exist" message', () => {
    expect(isMissingBrowserError(new Error(String.raw`browserType.launchPersistentContext: Executable doesn't exist at C:\Users\x\chrome.exe`))).toBe(true)
  })

  it('rejects an unrelated error', () => {
    expect(isMissingBrowserError(new Error('net::ERR_CONNECTION_REFUSED'))).toBe(false)
  })

  it('rejects a non-Error value', () => {
    expect(isMissingBrowserError('Executable doesn\'t exist at /x')).toBe(false)
    expect(isMissingBrowserError(undefined)).toBe(false)
    expect(isMissingBrowserError(null)).toBe(false)
  })
})
