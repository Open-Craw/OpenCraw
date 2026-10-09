import { answerOf, outputOfAnswer } from './callout-response.algorithm'

describe('outputOfAnswer', () => {
  it('returns the output of an ok answer, and undefined when it has none', () => {
    expect(outputOfAnswer('h', { status: 'ok', output: { x: 1 } })).toEqual({ x: 1 })
    expect(outputOfAnswer('h', { status: 'ok' })).toBeUndefined()
  })

  it('throws the reason of an error answer', () => {
    expect(() => outputOfAnswer('svc', { status: 'error', error: 'nope' })).toThrow('svc: nope')
  })

  it('refuses pending where a final answer is needed', () => {
    expect(() => outputOfAnswer('svc', { status: 'pending' })).toThrow(/where a final answer is needed/)
  })

  it('refuses anything that is not a response, with what was expected', () => {
    expect(() => outputOfAnswer('svc', 'hello')).toThrow(/expected \{"status":"ok","output":…\}/)
    expect(() => outputOfAnswer('svc', { status: 'ok', extra: 1 })).toThrow(/not a callout response/)
  })
})

describe('answerOf', () => {
  it('returns each kind of answer as it is, pending included', () => {
    expect(answerOf('h', { status: 'ok', output: 1 })).toEqual({ status: 'ok', output: 1 })
    expect(answerOf('h', { status: 'pending', retryAfterMs: 50 })).toEqual({ status: 'pending', retryAfterMs: 50 })
  })

  it('refuses what is not a response', () => {
    expect(() => answerOf('svc', { status: 'maybe' })).toThrow(/not a callout response/)
  })
})
