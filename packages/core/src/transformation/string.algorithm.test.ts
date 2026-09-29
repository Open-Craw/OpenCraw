import { padEnd, padStart, toText } from './string.algorithm'
import { TransformError } from './transform.error'

describe('toText', () => {
  it('coerces numbers, booleans and text as string form', () => {
    expect(toText('already text')).toBe('already text')
    expect(toText(42)).toBe('42')
    expect(toText(true)).toBe('true')
  })

  it('coerces values the string ops reject, unlike asText-backed ops', () => {
    expect(toText(null)).toBe('null')
    expect(toText(undefined)).toBe('undefined')
    expect(toText([1, 2])).toBe('1,2')
  })
})

describe('padStart', () => {
  it('pads on the left to the target length', () => {
    expect(padStart('7', 3, '0')).toBe('007')
    expect(padStart(7, 3, '0')).toBe('007')
  })

  it('defaults to a space', () => {
    expect(padStart('ab', 4)).toBe('  ab')
  })

  it('leaves text at or over the target length untouched', () => {
    expect(padStart('abcd', 2, '0')).toBe('abcd')
  })

  it('rejects a char that is not exactly one character', () => {
    expect(() => padStart('7', 3, '00')).toThrow(TransformError)
    expect(() => padStart('7', 3, '')).toThrow(/exactly one character/)
  })
})

describe('padEnd', () => {
  it('pads on the right to the target length', () => {
    expect(padEnd('7', 3, '0')).toBe('700')
  })

  it('defaults to a space', () => {
    expect(padEnd('ab', 4)).toBe('ab  ')
  })
})
