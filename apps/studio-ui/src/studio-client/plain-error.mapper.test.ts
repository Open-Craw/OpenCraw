import { plainError } from './plain-error.mapper'

describe('plainError', () => {
  it('says that an address of a file is a file, not a page, without the browser call log', () => {
    const raw = 'page.goto: Download is starting Call log: \u{1B}[2m - navigating to "https://x.test/a.pdf", waiting until "load"\u{1B}[22m'

    expect(plainError(raw)).toMatch(/file to download, not a web page/)
    expect(plainError(raw)).not.toMatch(/Call log|navigating/)
  })

  it.each([
    ['page.goto: net::ERR_NAME_NOT_RESOLVED at https://nope.invalid/', /could not be found/],
    ['page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:9/', /refused the connection/],
    ['page.goto: Timeout 30000ms exceeded.', /too long to answer/],
    ['request failed: status code 403', /access denied/],
    ['HTTP 404 Not Found', /page was not found/],
    ['status 429 Too Many Requests', /asked too often/],
    ['responded with a status of 503', /server error/],
  ])('puts %s in plain words', (raw, expected) => {
    expect(plainError(raw)).toMatch(expected)
  })

  it('keeps an error it does not know, cleaned of colour codes and the log', () => {
    expect(plainError('step steps.0 (goto) failed: something odd \u{1B}[2mhappened\u{1B}[22m Call log: - details')).toBe('step steps.0 (goto) failed: something odd happened')
  })
})
