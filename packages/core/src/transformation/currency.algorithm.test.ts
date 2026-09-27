import { parseCurrency } from './currency.algorithm'

describe('parseCurrency', () => {
  it('reads the amount and detects the currency from symbol or code', () => {
    expect(parseCurrency('10,00 €', 'de-DE')).toEqual({ amount: 10, currency: 'EUR' })
    expect(parseCurrency('USD 12.50')).toEqual({ amount: 12.5, currency: 'USD' })
    expect(parseCurrency('12.50 CHF')).toEqual({ amount: 12.5, currency: 'CHF' })
    expect(parseCurrency('R$ 1.234,56', 'pt-BR')).toEqual({ amount: 1234.56, currency: 'BRL' })
    expect(parseCurrency('£3')).toEqual({ amount: 3, currency: 'GBP' })
    expect(parseCurrency('£51.77')).toEqual({ amount: 51.77, currency: 'GBP' })
  })

  it('takes a three-letter code only when ISO 4217 has it (#77)', () => {
    expect(parseCurrency('OTR £34,000')).toEqual({ amount: 34_000, currency: 'GBP' })
    expect(parseCurrency('ABC 12')).toEqual({ amount: 12 })
    expect(parseCurrency('PRICE IN EUR: 12')).toEqual({ amount: 12, currency: 'EUR' })
  })

  it('prefers the code written against the amount (#77)', () => {
    expect(parseCurrency('ALL PRICES: USD 12')).toEqual({ amount: 12, currency: 'USD' })
    expect(parseCurrency('TOP DEAL 12 EUR')).toEqual({ amount: 12, currency: 'EUR' })
  })

  it('lets an explicit code win and leaves unknown currencies unset', () => {
    expect(parseCurrency('10,00 €', 'de-DE', 'CHF')).toEqual({ amount: 10, currency: 'CHF' })
    expect(parseCurrency('42')).toEqual({ amount: 42 })
    expect(parseCurrency(9.5, undefined, 'EUR')).toEqual({ amount: 9.5, currency: 'EUR' })
  })

  it('refuses a text with two amounts, naming the currency op', () => {
    expect(() => parseCurrency('£1,299.00 (was £1,499.00)')).toThrow(/^transform "currency": .* holds 2 numbers/)
  })
})
