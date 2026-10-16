import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { studioOpenRecipeTool, studioRunSampleTool, studioStatusTool } from './studio-tools.handler'

interface Sent { type: string, [key: string]: unknown }

/** A stand-in Studio: answers the commands the tools send, and remembers them. */
async function standInStudio (answers: Record<string, () => unknown>): Promise<{ server: Server, port: number, sent: Sent[] }> {
  const sent: Sent[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
    request.on('end', () => {
      const command = JSON.parse(body) as Sent
      sent.push(command)
      response.writeHead(request.headers['x-opencraw-token'] === 'secret' ? 200 : 401, { 'content-type': 'application/json' })
      response.end(JSON.stringify(answers[command.type]()))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()

  return { server, port: typeof address === 'object' && address !== null ? address.port : 0, sent }
}

function textOf (result: { content: { type: string, text?: string }[] }): unknown {
  return JSON.parse(result.content[0].text ?? 'null')
}

describe('the studio_ tools', () => {
  let directory: string
  let studio: Server | undefined

  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'oc-studios-')) })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
    const running = studio
    await new Promise<void>((resolve) => {
      if (running === undefined) resolve()
      else running.close(() => { resolve() })
    })
    studio = undefined
  })

  async function announce (port: number): Promise<void> {
    await writeFile(join(directory, `${String(process.pid)}-${String(port)}.json`), JSON.stringify({ pid: process.pid, url: `http://127.0.0.1:${String(port)}`, token: 'secret', startedAt: '2026-10-16T10:00:00.000Z' }))
  }

  it('says there is no Studio, and how to start one, when none announced itself', async () => {
    expect(textOf(await studioStatusTool(directory))).toMatchObject({ running: false, hint: expect.stringContaining('opencraw studio') })
    const opened = await studioOpenRecipeTool({ path: '/work/a.input.json' }, directory)
    expect(opened.isError).toBe(true)
  })

  it('ignores a Studio whose process is gone', async () => {
    await writeFile(join(directory, '999999-1.json'), JSON.stringify({ pid: 2_147_483_646, url: 'http://127.0.0.1:1', token: 'secret', startedAt: '2026-10-16T10:00:00.000Z' }))
    expect(textOf(await studioStatusTool(directory))).toMatchObject({ running: false })
  })

  it('reports what the running Studio is doing', async () => {
    const stand = await standInStudio({ 'studio-status': () => ({ folder: '/work', pages: 1 }) })
    studio = stand.server
    await announce(stand.port)

    expect(textOf(await studioStatusTool(directory))).toEqual({ running: true, url: `http://127.0.0.1:${String(stand.port)}`, folder: '/work', pages: 1 })
  })

  it('asks the open page to open the recipe, and says so when no page is open', async () => {
    let pages = 1
    const stand = await standInStudio({ 'ask-ui': () => ({ pages }) })
    studio = stand.server
    await announce(stand.port)

    expect(textOf(await studioOpenRecipeTool({ path: '/work/a.input.json' }, directory))).toEqual({ opened: true, pages: 1 })
    expect(stand.sent[0]).toEqual({ type: 'ask-ui', request: { kind: 'open', path: '/work/a.input.json' } })
    pages = 0
    expect(textOf(await studioOpenRecipeTool({ path: '/work/a.input.json' }, directory))).toMatchObject({ opened: false })
  })

  it('refuses to run a sample before Studio has a folder open', async () => {
    const stand = await standInStudio({ 'studio-status': () => ({ pages: 1 }) })
    studio = stand.server
    await announce(stand.port)

    const result = await studioRunSampleTool({ recipeId: 'items' }, directory)

    expect(result.isError).toBe(true)
    expect(stand.sent.map(command => command.type)).toEqual(['studio-status'])
  })

  it('runs a sample, waits for it to finish and returns the first records', async () => {
    let polls = 0
    const stand = await standInStudio({
      'studio-status': () => ({ folder: '/work', pages: 1 }),
      'run-sample':    () => ({ started: true }),
      'run-status':    () => {
        polls += 1

        return { recipeId: 'items', ...(polls < 2 ? { state: 'running' } : { state: 'finished', result: { emitted: 2, records: [{ key: null, data: { name: 'a1' } }] } }) }
      },
    })
    studio = stand.server
    await announce(stand.port)

    const result = await studioRunSampleTool({ recipeId: 'items', maxRecords: 3 }, directory)

    expect(textOf(result)).toMatchObject({ state: 'finished', result: { emitted: 2 } })
    expect(stand.sent.find(command => command.type === 'run-sample')).toEqual({ type: 'run-sample', recipeId: 'items', budget: { maxRecords: 3 } })
  })
})
