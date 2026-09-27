import { describe } from './string.algorithm'
import { TransformError } from './transform.error'

const TOKENS: Record<string, string> = { YYYY: String.raw`(?<year>\d{4})`, MM: String.raw`(?<month>\d{1,2})`, DD: String.raw`(?<day>\d{1,2})`, HH: String.raw`(?<hour>\d{1,2})`, mm: String.raw`(?<minute>\d{1,2})`, ss: String.raw`(?<second>\d{1,2})` }
const TOKEN = /YYYY|MM|DD|HH|mm|ss/g
/** A zone the text names: an offset after a time (`10:00Z`, `10:00 +0200`), `GMT` / `UTC`, or a US zone `Date.parse` knows. */
const ZONE = /\d:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}(?::?\d{2})?)\b|\b(?:GMT|UTC?)\b|\b[ECMP][SD]T\b/
/** The ISO calendar date forms JavaScript reads as UTC. */
const DATE_ONLY = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/
/** An ISO date and time without a zone. */
const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/

/**
 * Parses a date or instant.
 *
 * @param value - Text, a number (epoch milliseconds) or a Date.
 * @param format - Tokens `YYYY MM DD HH mm ss`, e.g. `DD/MM/YYYY`; without one the text must be ISO 8601 or otherwise `Date.parse`-able.
 * @param timezone - An IANA zone the text is written in when it carries no offset; default UTC, whatever the host's zone.
 * @returns The instant.
 * @throws TransformError when the text cannot be read.
 */
export function parseDate (value: unknown, format?: string, timezone?: string): Date {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value !== 'string') throw new TransformError('date', `expects text, got ${describe(value)}`, value)
  const text = value.trim()
  const parsed = format === undefined ? parseIso(text, timezone) : parseWithFormat(text, format, timezone)
  if (parsed === undefined || Number.isNaN(parsed.getTime())) throw new TransformError('date', `cannot read "${value}" as a date${format === undefined ? '' : ` with format ${format}`}`, value)

  return parsed
}

/** `YYYY-MM-DD` of an instant, in UTC. */
export function toIsoDate (date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Text without a format: ISO 8601 or anything `Date.parse` reads. Text that names its zone (`Z`, `+02:00`,
 * `GMT`) is that instant. A calendar date alone (`2026-03-04`) is midnight UTC. Any other text is a wall-clock
 * time in `timezone`, or in UTC without one: never in the host's zone, so every machine reads the same instant.
 */
function parseIso (text: string, timezone: string | undefined): Date | undefined {
  if (ZONE.test(text) || DATE_ONLY.test(text)) return new Date(text)
  const wallClock = ISO_LOCAL.test(text) ? new Date(`${text.replace(' ', 'T')}Z`) : hostFieldsAsUtc(new Date(text))
  if (Number.isNaN(wallClock.getTime())) return undefined

  return timezone === undefined ? wallClock : shiftFromZone(wallClock, timezone)
}

/**
 * `Date.parse` reads zone-less non-ISO text (`March 4, 2026 10:00`) in the host's zone; its wall-clock
 * fields, read back in that zone, are the text's.
 *
 * @param local - What `Date.parse` made of the text.
 * @returns The same wall-clock time as a UTC instant.
 */
function hostFieldsAsUtc (local: Date): Date {
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes(), local.getSeconds(), local.getMilliseconds()))
}

function parseWithFormat (text: string, format: string, timezone: string | undefined): Date | undefined {
  const escaped = format.replaceAll(/[.*+?^${}()|[\]\\/]/g, String.raw`\$&`)
  const source = escaped.replaceAll(TOKEN, token => TOKENS[token])
  const match = new RegExp(`^${source}$`).exec(text)
  if (match?.groups === undefined) return undefined
  const { year, month = '1', day = '1', hour = '0', minute = '0', second = '0' } = match.groups
  if (year === undefined) return undefined
  const fields = [Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)]
  const utc = new Date(Date.UTC(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5]))
  const actual = [utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds()]
  if (actual.some((part, index) => part !== fields[index])) return undefined

  return timezone === undefined ? utc : shiftFromZone(utc, timezone)
}

/**
 * Reinterprets a wall-clock time (built as if it were UTC) as a time in a zone.
 *
 * @param wallClock - The instant whose UTC fields are the wall-clock fields.
 * @param timezone - An IANA zone.
 * @returns The real instant.
 */
function shiftFromZone (wallClock: Date, timezone: string): Date {
  const offset = offsetOf(wallClock, timezone)
  const guess = new Date(wallClock.getTime() - offset)
  const corrected = offsetOf(guess, timezone)

  return corrected === offset ? guess : new Date(wallClock.getTime() - corrected)
}

function offsetOf (instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(instant)
  const field = (type: string): number => Number(parts.find(part => part.type === type)?.value ?? '0')
  const asUtc = Date.UTC(field('year'), field('month') - 1, field('day'), field('hour'), field('minute'), field('second'))

  return asUtc - instant.getTime()
}
