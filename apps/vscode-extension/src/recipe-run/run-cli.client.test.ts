import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cliScript, runCli } from './run-cli.client'

async function script (body: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'run-cli-'))
  const file = join(directory, 'program.mjs')
  await writeFile(file, body)

  return file
}

describe('runCli', () => {
  it('runs the program with its arguments, hands out its error output as it comes and reports the exit code', async () => {
    const file = await script('console.error("crawling " + process.argv.slice(2).join(" ")); process.exit(3)')
    const chunks: string[] = []

    const result = await runCli(file, ['a', 'b'], { onOutput: (chunk) => { chunks.push(chunk) } })

    expect(result).toMatchObject({ code: 3, cancelled: false })
    expect(result.stderr).toContain('crawling a b')
    expect(chunks.join('')).toContain('crawling a b')
  })

  it('stops the program when the signal aborts, and says it was stopped', async () => {
    const file = await script('console.error("started"); setInterval(() => {}, 1000)')
    const controller = new AbortController()

    const running = runCli(file, [], { signal: controller.signal, onOutput: () => { controller.abort() } })
    const result = await running

    expect(result.cancelled).toBe(true)
  })
})

describe('cliScript', () => {
  it('finds the program in the repository checkout, beside the app', () => {
    expect(cliScript(join(__dirname, '..', '..'))).toMatch(/packages[\\/]cli[\\/]bin[\\/]opencraw\.mjs$/)
  })

  it('says what is wrong when the program is nowhere to be found', () => {
    expect(() => cliScript(join(tmpdir(), 'nowhere'))).toThrow('missing from this installation')
  })
})
