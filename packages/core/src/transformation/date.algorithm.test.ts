import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { env } from 'node:process'
import { parseDate, toIsoDate } from './date.algorithm'
import { TransformError } from './transform.error'

describe('parseDate', () => {
  it('reads ISO text, epoch numbers and dates', () => {
    expect(parseDate('2026-03-04T05:06:07Z').toISOString()).toBe('2026-03-04T05:06:07.000Z')
    expect(parseDate('2026-03-04').toISOString()).toBe('2026-03-04T00:00:00.000Z')
    expect(parseDate(0).toISOString()).toBe('1970-01-01T00:00:00.000Z')
    const now = new Date()
    expect(parseDate(now)).toBe(now)
  })

  it('reads a custom format and interprets it in a zone', () => {
    expect(parseDate('04/03/2026', 'DD/MM/YYYY').toISOString()).toBe('2026-03-04T00:00:00.000Z')
    expect(parseDate('2026-07-01 12:00', 'YYYY-MM-DD HH:mm', 'Europe/Berlin').toISOString()).toBe('2026-07-01T10:00:00.000Z')
    expect(parseDate('2026-01-01T12:00:00', undefined, 'America/Sao_Paulo').toISOString()).toBe('2026-01-01T15:00:00.000Z')
  })

  describe('whatever the host\'s time zone (#77)', () => {
    /** Text, timezone, the instant expected. */
    const cases: [string, string | undefined, string][] = [
      ['2026-03-04T05:06:07', undefined, '2026-03-04T05:06:07.000Z'],
      ['2026-03-04 05:06', undefined, '2026-03-04T05:06:00.000Z'],
      ['March 4, 2026 10:30', undefined, '2026-03-04T10:30:00.000Z'],
      ['4 Mar 2026', undefined, '2026-03-04T00:00:00.000Z'],
      ['2026-03-04', undefined, '2026-03-04T00:00:00.000Z'],
      ['March 4, 2026 10:30', 'Europe/Berlin', '2026-03-04T09:30:00.000Z'],
      ['2026-03-04T05:06:07+02:00', undefined, '2026-03-04T03:06:07.000Z'],
      ['Wed, 04 Mar 2026 05:06:07 GMT', undefined, '2026-03-04T05:06:07.000Z'],
      ['Wed, 04 Mar 2026 05:06:07 +0100', undefined, '2026-03-04T04:06:07.000Z'],
      ['March 4, 2026 10:30 EST', undefined, '2026-03-04T15:30:00.000Z'],
      ['2026-03-04T05:06:07Z', 'Europe/Berlin', '2026-03-04T05:06:07.000Z'],
    ]

    it('reads text without a zone as UTC or in the timezone given, and keeps a zone the text names', () => {
      for (const [text, timezone, instant] of cases) expect(parseDate(text, undefined, timezone).toISOString()).toBe(instant)
    })

    it('reads the same instants on a host in Tokyo', () => {
      // Jest's process.env is a copy, so the host zone can only change in a process of its own.
      const script = `const { parseDate } = require(${JSON.stringify(join(__dirname, 'date.algorithm.ts'))}); process.stdout.write(JSON.stringify([new Date(2026, 0, 1).getTimezoneOffset(), ...${JSON.stringify(cases)}.map(([text, zone]) => parseDate(text, undefined, zone ?? undefined).toISOString())]))`
      const output = execFileSync(process.execPath, ['--require', '@swc-node/register', '--eval', script], { env: { ...env, TZ: 'Asia/Tokyo' }, encoding: 'utf8' })
      expect(JSON.parse(output)).toEqual([-540, ...cases.map(entry => entry[2])])
    }, 30_000)
  })

  it('rejects unreadable text', () => {
    expect(() => parseDate('yesterday')).toThrow(TransformError)
    expect(() => parseDate('2026-13-45', 'YYYY-MM-DD')).toThrow(TransformError)
    expect(() => parseDate('x', 'DD/MM/YYYY')).toThrow(/with format DD\/MM\/YYYY/)
  })
})

describe('toIsoDate', () => {
  it('keeps the UTC calendar date', () => {
    expect(toIsoDate(new Date('2026-03-04T23:59:59Z'))).toBe('2026-03-04')
  })
})
