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
    expect(parseNumber('1.299,50 €')).toBe(1299.5)
    expect(parseNumber('1,234,567')).toBe(1_234_567)
    expect(parseNumber('12,34,567')).toBe(1_234_567)
    expect(parseNumber('12.3456')).toBe(12.3456)
    expect(parseNumber('1234,567')).toBe(1234.567)
  })

  it('reads a single separator after a lone leading 0, or a leading separator, as a decimal (#77)', () => {
    expect(parseNumber('0.125')).toBe(0.125)
    expect(parseNumber('-0.125')).toBe(-0.125)
    expect(parseNumber('0,125')).toBe(0.125)
    expect(parseNumber('.5')).toBe(0.5)
    expect(parseNumber('Rating: ,75')).toBe(0.75)
  })

  it('reads the one number in a text with a sign, currency and words around it (#77)', () => {
    expect(parseNumber('£51.77')).toBe(51.77)
    expect(parseNumber('In stock (22 available)')).toBe(22)
    expect(parseNumber('USD -12.50')).toBe(-12.5)
    expect(parseNumber('−7 °C')).toBe(-7)
    expect(parseNumber('+3')).toBe(3)
    expect(parseNumber('item-22')).toBe(22)
    expect(parseNumber('1 234 567 units')).toBe(1_234_567)
    expect(parseNumber('CHF 1\'299.50')).toBe(1299.5)
    expect(parseNumber('Price: 1.299,00 €')).toBe(1299)
  })

  it('refuses a text holding several numbers, naming it and pointing at regex (#77)', () => {
    expect(() => parseNumber('2 for 10,00')).toThrow('transform "number": "2 for 10,00" holds 2 numbers (2, 10,00): pick one with a "regex" transform first')
    expect(() => parseNumber('a897fe39b1053632')).toThrow(/"a897fe39b1053632" holds 3 numbers \(897, 39, 1053632\)/)
    expect(() => parseNumber('10-20')).toThrow(/holds 2 numbers/)
    expect(() => parseNumber('2026-03-04')).toThrow(/holds 3 numbers/)
  })

  it('refuses a number whose separators make no sense', () => {
    expect(() => parseNumber('1.2.3')).toThrow('transform "number": cannot read "1.2.3" as a number')
    expect(() => parseNumber('22.10.2026')).toThrow(/cannot read/)
    expect(() => parseNumber('1,234.5.6')).toThrow(/cannot read/)
    expect(() => parseNumber('0.125', 'de-DE')).toThrow(/cannot read/)
  })

  it('reads with a locale\'s separators', () => {
    expect(parseNumber('1.299', 'en-US')).toBe(1.299)
    expect(parseNumber('1,299', 'de-DE')).toBe(1.299)
    expect(parseNumber('1.299', 'de-DE')).toBe(1299)
    expect(() => parseNumber('1,234.5', 'de-DE')).toThrow(/cannot read/)
  })

  it('rejects text without a number', () => {
    expect(() => parseNumber('n/a')).toThrow(TransformError)
    expect(() => parseNumber('')).toThrow('no number in ""')
    expect(() => parseNumber(null)).toThrow(/expects text/)
  })
})

describe('parseInteger', () => {
  it('truncates', () => {
    expect(parseInteger('12.9')).toBe(12)
    expect(parseInteger('-12.9')).toBe(-12)
  })

  it('names integer in its errors (#80)', () => {
    expect(() => parseInteger('n/a')).toThrow('transform "integer": no number in "n/a"')
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
