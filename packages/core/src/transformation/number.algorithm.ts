import { describe } from './string.algorithm'
import { TransformError } from './transform.error'

/** Short default phrases: `true` only when they are the whole text, so "none" or "2021" stay `false`. */
const DEFAULT_TRUTHY_WORDS = new Set(['true', 'yes', 'y', '1', 'on'])
/** Longer default phrases: `true` anywhere in the text, as whole words ("In stock (3 left)", not "unavailable"). */
const DEFAULT_TRUTHY_PHRASES = [/\bin stock\b/, /\bavailable\b/]

/**
 * The decimal and group separators a locale uses.
 *
 * @param locale - A BCP 47 tag; `undefined` means "guess from the text".
 * @returns The two separators.
 */
export function separatorsOf (locale: string): { decimal: string, group: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5)
  const decimal = parts.find(part => part.type === 'decimal')?.value ?? '.'
  const group = parts.find(part => part.type === 'group')?.value ?? ','

  return { decimal, group }
}

/** Spaces and apostrophes that group thousands (`1 234`, `1 234` in French, `1'234` in Swiss German): only before three digits. */
const GROUP_SPACE = String.raw`[ \u{A0}\u{202F}'’]`
/**
 * One number in a text: an optional sign not glued to a word (`item-22` holds 22), then digits with `.` or `,`
 * between them (a space or apostrophe only before a group of three), or a separator then digits (`.5`).
 */
const NUMBER = new RegExp(String.raw`(?:(?<![\p{L}\p{N}])[-+−])?(?:\d+(?:(?:[.,]|${GROUP_SPACE}(?=\d{3}(?!\d)))\d+)*|(?<![\p{L}\p{N}.,])[.,]\d+)`, 'gu')

/**
 * Parses the one number in a text, tolerating a sign, currency symbols and codes, words around it, and
 * locale separators. A text holding two numbers or more (`"2 for 10,00"`, an id like `"a897fe39"`) is an
 * error rather than a guess: pick one with a `regex` transform first.
 *
 * @param value - Text or a number.
 * @param locale - The locale the text is written in. Without one, the decimal separator is guessed: of two
 * kinds of separator the last one; a single separator is a thousands separator only when exactly three digits
 * follow it and one to three digits other than a lone `0` precede it (`1.299` is 1299, `0.125` and `10,00`
 * are decimals); a repeated one groups thousands (`1,234,567`).
 * @param op - The transform or type to name in errors.
 * @returns The number.
 * @throws TransformError when the text holds no number, several, or one that cannot be read.
 */
export function parseNumber (value: unknown, locale?: string, op = 'number'): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') throw new TransformError(op, `expects text or a number, got ${describe(value)}`, value)
  const found = Array.from(value.matchAll(NUMBER), match => match[0])
  if (found.length === 0) throw new TransformError(op, `no number in "${value}"`, value)
  if (found.length > 1) throw new TransformError(op, `"${value}" holds ${found.length} numbers (${found.join(', ')}): pick one with a "regex" transform first`, value)
  const parsed = readNumber(found[0], locale)
  if (parsed === undefined) throw new TransformError(op, `cannot read "${value}" as a number`, value)

  return parsed
}

/**
 * @param token - One match of {@link NUMBER}.
 * @param locale - The locale the text is written in, if known.
 * @returns The number, or `undefined` when its separators make no sense (`1.2.3`, `22.10.2026`).
 */
function readNumber (token: string, locale: string | undefined): number | undefined {
  const negative = /^[-−]/u.test(token)
  const body = token.replace(/^[-+−]/u, '').replaceAll(new RegExp(GROUP_SPACE, 'gu'), '')
  const plain = assemble(body, locale === undefined ? guessDecimal(body) : separatorsOf(locale).decimal)
  if (plain === undefined) return undefined
  const parsed = Number(plain)

  return negative ? -parsed : parsed
}

/**
 * Puts a number together as `1234.5`: the part before the decimal separator is groups of digits.
 *
 * @param body - Digits and separators, without sign or spaces.
 * @param decimal - The decimal separator, `undefined` when the number has none.
 * @returns The number as plain text, or `undefined` when it is not a well-formed number.
 */
function assemble (body: string, decimal: string | undefined): string | undefined {
  const [whole, fraction, ...rest] = decimal === undefined || !body.includes(decimal) ? [body] : body.split(decimal)
  if (rest.length > 0 || /[.,]/.test(fraction ?? '')) return undefined
  const groups = whole.split(/[.,]/)
  if (groups.length > 1 && !wellGrouped(groups)) return undefined

  return `${groups.join('') || '0'}${fraction === undefined ? '' : `.${fraction}`}`
}

/** Thousands (`1,234,567`) or the Indian lakh grouping (`12,34,567`). */
function wellGrouped (groups: readonly string[]): boolean {
  const [lead, ...others] = groups
  if (lead === '0' || !/^\d{1,3}$/.test(lead)) return false
  const last = others.at(-1)

  return others.every(group => group.length === 3) || (last?.length === 3 && others.slice(0, -1).every(group => group.length === 2))
}

function guessDecimal (body: string): string | undefined {
  const lastDot = body.lastIndexOf('.')
  const lastComma = body.lastIndexOf(',')
  if (lastDot === -1 && lastComma === -1) return undefined
  if (lastDot !== -1 && lastComma !== -1) return lastDot > lastComma ? '.' : ','
  const mark = lastDot === -1 ? ',' : '.'
  const [whole, fraction, ...rest] = body.split(mark)
  if (rest.length > 0) return undefined
  const thousands = fraction.length === 3 && /^\d{1,3}$/.test(whole) && whole !== '0'

  return thousands ? undefined : mark
}

/**
 * Parses the one number in a text and truncates it.
 *
 * @param value - Text or a number.
 * @param locale - The locale the text is written in.
 * @returns The integer.
 * @throws TransformError (naming `integer`) when no single number can be read.
 */
export function parseInteger (value: unknown, locale?: string): number {
  return Math.trunc(parseNumber(value, locale, 'integer'))
}

/**
 * Reads a boolean the way a recipe means it.
 *
 * @param value - Any value.
 * @param truthy - Phrases that mean `true` (case-insensitive, matched as a substring). Without it:
 * the whole text is `true`, `yes`, `y`, `1` or `on`, or it contains the words `in stock` or `available`.
 * @returns The boolean.
 */
export function parseBoolean (value: unknown, truthy?: readonly string[]): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (value === null || value === undefined) return false
  const text = String(value).trim().toLowerCase()
  if (text === '') return false

  if (truthy !== undefined) return truthy.some(phrase => text.includes(phrase.toLowerCase()))

  return DEFAULT_TRUTHY_WORDS.has(text) || DEFAULT_TRUTHY_PHRASES.some(phrase => phrase.test(text))
}
