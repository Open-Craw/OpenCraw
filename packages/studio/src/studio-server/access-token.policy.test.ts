import { generateToken, isAuthorized, TOKEN_COOKIE } from './access-token.policy'

describe('generateToken', () => {
  it('generates a long, unpredictable token, different every time', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(32)
  })
})

describe('isAuthorized', () => {
  const token = 'the-token'

  it('accepts the header', () => {
    expect(isAuthorized(token, { headers: { 'x-opencraw-token': token } }, new URLSearchParams())).toBe(true)
  })

  it('accepts the query param', () => {
    expect(isAuthorized(token, { headers: {} }, new URLSearchParams('token=the-token'))).toBe(true)
  })

  it('accepts the cookie', () => {
    expect(isAuthorized(token, { headers: { cookie: `${TOKEN_COOKIE}=the-token; other=1` } }, new URLSearchParams())).toBe(true)
  })

  it('rejects a wrong token', () => {
    expect(isAuthorized(token, { headers: { 'x-opencraw-token': 'nope' } }, new URLSearchParams())).toBe(false)
  })

  it('rejects a request with no token at all', () => {
    expect(isAuthorized(token, { headers: {} }, new URLSearchParams())).toBe(false)
  })
})
