import { activeStubs, parseStubText } from './active-stubs.algorithm'

describe('parseStubText', () => {
  it('reads any JSON value, null included', () => {
    expect(parseStubText('{"amount": 9}')).toEqual({ ok: true, value: { amount: 9 } })
    expect(parseStubText('"abc"')).toEqual({ ok: true, value: 'abc' })
    expect(parseStubText('42')).toEqual({ ok: true, value: 42 })
    expect(parseStubText('null')).toEqual({ ok: true, value: null })
  })

  it('refuses text that is not JSON, and an empty field', () => {
    expect(parseStubText('abc')).toEqual({ ok: false })
    expect(parseStubText('{"a":')).toEqual({ ok: false })
    expect(parseStubText(' '.repeat(3))).toEqual({ ok: false })
  })
})

describe('activeStubs', () => {
  it('holds the value of every stub that is on and valid', () => {
    expect(activeStubs({ price: { enabled: true, text: '{"amount": 9}' }, slug: { enabled: true, text: '"a-b"' } })).toEqual({ price: { amount: 9 }, slug: 'a-b' })
  })

  it('leaves out a stub that is off, and one that is on but not valid, so that hook is called', () => {
    expect(activeStubs({ price: { enabled: false, text: '1' }, slug: { enabled: true, text: 'oops' } })).toBeUndefined()
  })

  it('is undefined when there are no stubs', () => {
    expect(activeStubs({})).toBeUndefined()
  })
})
