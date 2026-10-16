import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportRecords } from './export-records.use-case'

const OUTPUT = { kind: 'output', id: 'cars', version: 1, fields: { model: { type: 'string' }, price: { type: 'number' } } }
const LINES = [
  { model: 'Clio', price: 19900, _source: { recipeId: 'shop', url: 'https://x.test/1', emittedAt: '2026-10-16T10:00:00.000Z' } },
  { model: 'Twingo', price: 17500, _source: { recipeId: 'shop', url: 'https://x.test/2', emittedAt: '2026-10-16T10:00:01.000Z' } },
]

function terminal (): { out: string[], err: string[], api: { out: (line: string) => void, err: (line: string) => void } } {
  const out: string[] = []
  const err: string[] = []
  const toOut = (line: string): void => {
    out.push(line)
  }
  const toErr = (line: string): void => {
    err.push(line)
  }

  return { out, err, api: { out: toOut, err: toErr } }
}

async function files (): Promise<{ directory: string, records: string, output: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'export-cli-'))
  const records = join(directory, 'run.jsonl')
  const output = join(directory, 'cars.output.json')
  await writeFile(records, `${LINES.map(line => JSON.stringify(line)).join('\n')}\n`)
  await writeFile(output, JSON.stringify(OUTPUT))

  return { directory, records, output }
}

describe('exportRecords', () => {
  it('writes the run again in the format the extension names, with the output recipe\'s fields as columns', async () => {
    const { directory, records, output } = await files()
    const out = join(directory, 'cars.csv')
    const t = terminal()

    const code = await exportRecords({ name: 'export', records, output, out, options: { insecureTls: false } }, t.api)

    expect(code).toBe(0)
    expect(await readFile(out, 'utf8')).toBe('model,price\r\nClio,19900\r\nTwingo,17500\r\n')
    expect(t.err[0]).toMatch(/^2 records written to /)
  })

  it('refuses an extension that names no format, and a file that is not an output recipe', async () => {
    const { directory, records, output } = await files()
    const t = terminal()

    expect(await exportRecords({ name: 'export', records, output, out: join(directory, 'cars.txt'), options: { insecureTls: false } }, t.api)).toBe(1)
    expect(t.err.join('\n')).toContain('ends in ".txt"')

    const bad = terminal()
    expect(await exportRecords({ name: 'export', records, output: records, out: join(directory, 'cars.csv'), options: { insecureTls: false } }, bad.api)).toBe(1)
  })
})
