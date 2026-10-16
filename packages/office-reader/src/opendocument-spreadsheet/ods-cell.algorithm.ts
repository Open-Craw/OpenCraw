import type { CellValue, ValueMode } from '../spreadsheet'

/** A cell as `content.xml` stores it: its attributes and the text of its paragraphs. */
export interface OdsStoredCell {
  /** The cell's attributes, with their prefixes (`office:value-type`, `office:value`...). */
  attributes: Readonly<Record<string, string>>
  /** The text a person sees, one entry per paragraph. */
  paragraphs: readonly string[]
}

const NUMERIC_TYPES = new Set(['float', 'percentage', 'currency'])

/** A date value (`2026-06-01`, `2026-06-01T09:30:00`) as a `Date` holding the wall-clock time as UTC. */
function dateOf (value: string): Date | undefined {
  const withTime = value.includes('T')
  const hasZone = /(?:Z|[+-]\d\d:\d\d)$/.test(value)
  const date = new Date(hasZone ? value : (withTime ? `${value}Z` : `${value}T00:00:00Z`))

  return Number.isNaN(date.getTime()) ? undefined : date
}

/** A duration value (`PT09H30M00S`, `P1DT2H`) as seconds. */
function secondsOf (value: string): number | undefined {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value)
  if (match === null) return undefined
  const [, days, hours, minutes, seconds] = match

  return Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)
}

/** 1899-12-30, the day an `.xlsx` time of day (a serial below 1) falls on: a time reads the same in both. */
const TIME_OF_DAY_BASE_MS = Date.UTC(1899, 11, 30)

function isoText (date: Date, timeOfDay: boolean): string {
  const iso = date.toISOString()
  if (timeOfDay) return iso.slice(11, 19)

  return iso.slice(11, 19) === '00:00:00' ? iso.slice(0, 10) : iso.slice(0, 19)
}

/** A cell's value as typed: text, number, boolean, date, error, or `null` when empty. */
function typedValue (cell: OdsStoredCell): CellValue {
  const { attributes } = cell
  const text = cell.paragraphs.join('\n')
  if (attributes['calcext:value-type'] === 'error') return { error: text }
  const type = attributes['office:value-type']
  if (type !== undefined && NUMERIC_TYPES.has(type)) {
    const raw = attributes['office:value']
    if (raw === undefined || raw.trim() === '') return null
    const number = Number(raw)

    return Number.isNaN(number) ? raw : number
  }
  switch (type) {
    case 'boolean': {
      return attributes['office:boolean-value'] === 'true'
    }
    case 'date': {
      const raw = attributes['office:date-value'] ?? ''

      return dateOf(raw) ?? (raw === '' ? null : raw)
    }
    case 'time': {
      const seconds = secondsOf(attributes['office:time-value'] ?? '')

      return seconds === undefined ? (text === '' ? null : text) : new Date(TIME_OF_DAY_BASE_MS + (seconds * 1000))
    }
    default: {
      // `string`, or no type at all: a cell holding only text.
      const value = attributes['office:string-value'] ?? text

      return value === '' ? null : value
    }
  }
}

/**
 * A cell in the mode asked for. Typed: numbers, booleans, dates (wall-clock time as UTC) and text; `null` when empty. Text: the canonical text
 * the `.xlsx` reader gives (shortest round-trip numbers, ISO dates, `true`/`false`), `''` when empty. A formula gives the value stored with it;
 * nothing is evaluated, and display formats are not applied.
 *
 * @param cell - The stored cell.
 * @param mode - `typed` or `text`.
 * @returns The value.
 */
export function odsCellValue (cell: OdsStoredCell, mode: ValueMode): CellValue {
  const value = typedValue(cell)
  if (mode === 'typed') return value
  if (value === null) return ''
  if (value instanceof Date) return isoText(value, cell.attributes['office:value-type'] === 'time')
  if (typeof value === 'object') return value.error

  return String(value)
}
