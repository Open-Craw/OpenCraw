import { navigationDecision } from './navigation.policy'

const ORIGIN = 'http://127.0.0.1:5000'

describe('navigationDecision', () => {
  it('allows the app itself', () => {
    expect(navigationDecision('http://127.0.0.1:5000/?token=t&folder=%2Fa', ORIGIN)).toBe('allow')
  })

  it('sends another port on the same host out of the app', () => {
    expect(navigationDecision('http://127.0.0.1:6000/', ORIGIN)).toBe('external')
  })

  it('sends a web page to the browser', () => {
    expect(navigationDecision('https://example.com/docs', ORIGIN)).toBe('external')
  })

  it('refuses file, javascript and custom schemes', () => {
    expect(navigationDecision('file:///c:/secrets.txt', ORIGIN)).toBe('deny')
    expect(navigationDecision('javascript:alert(1)', ORIGIN)).toBe('deny')
    expect(navigationDecision('ms-msdt:/id', ORIGIN)).toBe('deny')
  })

  it('refuses what is not a URL', () => {
    expect(navigationDecision('not a url', ORIGIN)).toBe('deny')
  })
})
