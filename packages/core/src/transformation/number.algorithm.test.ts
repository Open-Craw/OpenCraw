import { parseBoolean, parseInteger, parseNumber } from './number.algorithm'
import { TransformError } from './transform.error'

describe('parseNumber', () => {
  it('reads plain and locale-formatted numbers', () => {
    expect(parseNumber('1234.5')).toBe(1234.5)
    expect(parseNumber('1,234.50')).toBe(1234.5)
    expect(parseNumber('1.234,50', 'de-DE')).toBe(1234.5)
    expect(parseNumber('1 234,50', 'fr-FR')).toBe(1234.5)
    expect(parseNumber('€ 1.299,00', 'de-DE')).toBe(1299)
    expect(parseNumber('$1,299')).toBe(1299)
    expect(parseNumber('-3', undefined)).toBe(-3)
    expect(parseNumber(7)).toBe(7)
  })

  it('guesses the decimal separator without a locale', () => {
    expect(parseNumber('10,00')).toBe(10)
    expect(parseNumber('1.299')).toBe(1299)
    expect(parseNumber('1.299,5')).toBe(1299.5)
  })

  it('rejects text without a number', () => {
    expect(() => parseNumber('n/a')).toThrow(TransformError)
    expect(() => parseNumber(null)).toThrow(/expects text/)
  })
})

describe('parseInteger', () => {
  it('truncates', () => {
    expect(parseInteger('12.9')).toBe(12)
  })
})

describe('parseBoolean', () => {
  it('uses the default phrases and a custom list', () => {
    expect(parseBoolean('In Stock (3 left)')).toBe(true)
    expect(parseBoolean('Sold out')).toBe(false)
    expect(parseBoolean('Available now', ['available'])).toBe(true)
    expect(parseBoolean('yes', ['ja'])).toBe(false)
    expect(parseBoolean(1)).toBe(true)
    expect(parseBoolean(false)).toBe(false)
    expect(parseBoolean(undefined)).toBe(false)
  })

  it('matches the short default phrases only as the whole text (#64)', () => {
    for (const text of ['none', 'Monday', 'Sold out today', 'only by request', '2021', '0.1', 'no', 'sold out']) expect(parseBoolean(text)).toBe(false)
    for (const text of ['true', ' Yes ', 'Y', '1', 'ON']) expect(parseBoolean(text)).toBe(true)
  })

  it('matches the long default phrases as whole words anywhere in the text (#64)', () => {
    expect(parseBoolean('Available now')).toBe(true)
    expect(parseBoolean('Currently unavailable')).toBe(false)
    expect(parseBoolean('Restocking')).toBe(false)
  })

  it('keeps substring matching for a recipe\'s own phrases', () => {
    expect(parseBoolean('Only 2 in stock!', ['in stock'])).toBe(true)
    expect(parseBoolean('Monday', ['on'])).toBe(true)
  })
})
