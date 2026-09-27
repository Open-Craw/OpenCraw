import { parseNumber } from './number.algorithm'

/** A money amount with its ISO 4217 code, when known. */
export interface Money {
  amount:    number
  currency?: string
}

const SYMBOLS: Record<string, string> = { '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW', 'R$': 'BRL', 'US$': 'USD', 'CA$': 'CAD', 'A$': 'AUD', '$': 'USD' }
/** Three capital letters on their own: a currency code only when ISO 4217 has it (`OTR` is not one). */
const CODE = /(?<![A-Za-z])[A-Z]{3}(?![A-Za-z])/g
/** A code written against the amount, `USD 12.50` or `12.50 USD`: it wins over a code elsewhere in the text. */
const CODE_BY_AMOUNT = /(?<![A-Za-z])([A-Z]{3})\s*[-+−]?[.,]?\d|\d\s*([A-Z]{3})(?![A-Za-z])/g

let isoCodes: Set<string> | undefined

/** The ISO 4217 codes this runtime knows. */
function iso (): Set<string> {
  isoCodes ??= new Set(Intl.supportedValuesOf('currency'))

  return isoCodes
}

/**
 * Parses a price. The currency comes from the explicit code, else an ISO 4217 code written against the amount,
 * else a symbol in the text, else an ISO 4217 code anywhere in it. Three capital letters that are not an
 * ISO 4217 code (`OTR £34,000`) are ignored.
 *
 * @param value - Text such as `1.299,00 €` or a number.
 * @param locale - The locale the text is written in.
 * @param currency - An explicit ISO 4217 code that wins over anything in the text.
 * @returns The money value.
 * @throws TransformError when the text does not hold exactly one number.
 */
export function parseCurrency (value: unknown, locale?: string, currency?: string): Money {
  const amount = parseNumber(value, locale, 'currency')
  if (typeof value !== 'string') return currency === undefined ? { amount } : { amount, currency }
  const detected = currency ?? detectCurrency(value)

  return detected === undefined ? { amount } : { amount, currency: detected }
}

function detectCurrency (text: string): string | undefined {
  const known = iso()
  const byAmount = Array.from(text.matchAll(CODE_BY_AMOUNT), match => match[1] ?? match[2]).find(code => known.has(code))
  if (byAmount !== undefined) return byAmount
  const symbol = Object.entries(SYMBOLS).find(([mark]) => text.includes(mark))?.[1]
  if (symbol !== undefined) return symbol

  return text.match(CODE)?.find(code => known.has(code))
}
