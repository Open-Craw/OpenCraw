import { outputOfAnswer } from './callout-response.algorithm'

describe('outputOfAnswer', () => {
  it('returns the output of an ok answer, and undefined when it has none', () => {
    expect(outputOfAnswer('h', { status: 'ok', output: { x: 1 } })).toEqual({ x: 1 })
    expect(outputOfAnswer('h', { status: 'ok' })).toBeUndefined()
  })

  it('throws the reason of an error answer', () => {
    expect(() => outputOfAnswer('svc', { status: 'error', error: 'nope' })).toThrow('svc: nope')
  })

  it('refuses pending until a callback handler exists', () => {
    expect(() => outputOfAnswer('svc', { status: 'pending' })).toThrow(/waiting for a callback is not supported yet/)
  })

  it('refuses anything that is not a response, with what was expected', () => {
    expect(() => outputOfAnswer('svc', 'hello')).toThrow(/expected \{"status":"ok","output":…\}/)
    expect(() => outputOfAnswer('svc', { status: 'ok', extra: 1 })).toThrow(/not a callout response/)
  })
})
