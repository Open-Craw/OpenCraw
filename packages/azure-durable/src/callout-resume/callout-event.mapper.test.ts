import { callbackBaseOf, callbackUrl, calloutEventName } from './callout-event.mapper'

describe('calloutEventName', () => {
  it('names the event by recipe and call, so identical calls of two recipes stay apart', () => {
    expect(calloutEventName(0, 'abc')).toBe('opencraw-callout:0:abc')
    expect(calloutEventName(1, 'abc')).not.toBe(calloutEventName(0, 'abc'))
  })
})

describe('callbackBaseOf', () => {
  it('is the start URL without its last segment, so /crawl and /callouts are siblings', () => {
    expect(callbackBaseOf('https://app.azurewebsites.net/api/crawl', {})).toBe('https://app.azurewebsites.net/api')
    expect(callbackBaseOf('https://app.azurewebsites.net/api/opencraw/crawl?code=x', {})).toBe('https://app.azurewebsites.net/api/opencraw')
  })

  it('prefers the public URL the host configured, without a trailing slash', () => {
    const settings = { callouts: { signingKeyEnv: 'K', waitMs: 1, publicUrl: 'https://crawl.example.com/api/' } }

    expect(callbackBaseOf('http://127.0.0.1:7071/api/crawl', settings)).toBe('https://crawl.example.com/api')
  })
})

describe('callbackUrl', () => {
  it('puts the token in the path the resolve route listens on', () => {
    expect(callbackUrl('https://app/api', 'tok')).toBe('https://app/api/callouts/tok/resolve')
  })
})
