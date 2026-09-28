import { cpSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { WhyView } from '../src/studio-api'
import { startFixtureSite, stopFixtureSite } from './fixture-site'

const RECIPES_FOLDER = join(__dirname, 'recipes')

function recipesFolder (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-record-'))
  cpSync(RECIPES_FOLDER, folder, { recursive: true })

  return folder
}

function emptyUiRoot (): string {
  return mkdtempSync(join(tmpdir(), 'opencraw-e2e-ui-'))
}

function commandUrl (server: StudioServer): string {
  return `http://127.0.0.1:${new URL(server.url).port}/api/command`
}

async function post<T> (server: StudioServer, body: unknown): Promise<T> {
  const response = await fetch(commandUrl(server), {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-opencraw-token': server.token },
    body:    JSON.stringify(body),
  })
  if (response.status !== 200) {
    const text = await response.text()
    throw new Error(`${response.status} on ${JSON.stringify(body)}: ${text}`)
  }

  return response.json() as Promise<T>
}

interface RecordMessage {
  type:      string
  key?:      string | null
  data?:     Record<string, unknown>
  mapping?:  Record<string, { from: unknown, steps: { op: string, value: unknown }[] }>
  field?:    string
  reason?:   string
  emitted?:  number
  rejected?: number
}

/** Runs the given recipe as a sample over a fresh WebSocket connection, and resolves with every `record`/`record-rejected` message plus the final `run-finished` summary. */
async function runSample (server: StudioServer, recipeId: string): Promise<{ records: RecordMessage[], rejected: RecordMessage[], finished: RecordMessage }> {
  const socket = new WebSocket(`ws://127.0.0.1:${new URL(server.url).port}/ws?token=${server.token}`)
  const records: RecordMessage[] = []
  const rejected: RecordMessage[] = []
  const finished = new Promise<RecordMessage>((resolve) => {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as RecordMessage
      switch (message.type) {
        case 'record': {
          records.push(message)
          break
        }
        case 'record-rejected': {
          rejected.push(message)
          break
        }
        case 'run-finished': { {
          resolve(message)
          // No default
        }
        break
        }
      }
    })
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve)
    socket.addEventListener('error', reject)
  })

  await post(server, { type: 'run-sample', recipeId })
  const result = await finished
  socket.close()

  return { records, rejected, finished: result }
}

describe('studio phase 3: the Record tab (#92)', () => {
  let site: Server
  let server: StudioServer

  beforeAll(async () => { site = await startFixtureSite() })
  afterAll(async () => { await stopFixtureSite(site) })
  afterEach(async () => { await server?.close() })

  it('maps a field by drag (simulated: the same save-recipe a drop makes) with a currency transform, and the mapping trace shows the value after it', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder()
    const inputPath = join(folder, 'products.input.json')
    const outputPath = join(folder, 'product.output.json')
    await post(server, { type: 'open-workspace', folder })

    // The Record tab's "+ field" then a pill dropped onto its source: a new output field, and the input
    // recipe's mapping gaining an entry for it — exactly what dragging the `item` pill onto the row writes.
    const output = JSON.parse(readFileSync(outputPath, 'utf8')) as { fields: Record<string, unknown> }
    output.fields.priceLabel = { type: 'currency', currency: 'USD', required: false }
    await post(server, { type: 'save-recipe', path: outputPath, recipe: output })

    const input = JSON.parse(readFileSync(inputPath, 'utf8')) as { mapping: Record<string, unknown> }
    input.mapping.priceLabel = { from: 'item.price' }
    await post(server, { type: 'save-recipe', path: inputPath, recipe: input })

    // Add the currency transform to the chain (the transform-chain editor's "+ transform").
    input.mapping.priceLabel = { from: 'item.price', transform: [{ op: 'currency' }] }
    await post(server, { type: 'save-recipe', path: inputPath, recipe: input })

    const { records, finished } = await runSample(server, 'products')

    expect(finished.emitted).toBe(2)
    const widget = records.find(record => record.data?.name === 'Widget')
    expect(widget?.data?.priceLabel).toEqual({ amount: 9.5, currency: 'USD' })
    // The transform chain's real value after the currency block: {amount: 9.5} before the field's own
    // currency code is applied at coercion (the mapping trace is the transform's own output, not the
    // finished, coerced field — the Record tab shows both).
    expect(widget?.mapping?.priceLabel.steps).toEqual([{ op: 'currency', value: { amount: 9.5 } }])
  }, 30000)

  it('makes a field integer with a text source (skip-record, so the rejection surfaces per record instead of halting the run) and the red reason names the coercion failure', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder()
    const inputPath = join(folder, 'products.input.json')
    const outputPath = join(folder, 'product.output.json')
    await post(server, { type: 'open-workspace', folder })

    const output = JSON.parse(readFileSync(outputPath, 'utf8')) as { fields: Record<string, unknown> }
    output.fields.nameAsInt = { type: 'integer', onMissing: 'skip-record' }
    await post(server, { type: 'save-recipe', path: outputPath, recipe: output })

    const input = JSON.parse(readFileSync(inputPath, 'utf8')) as { mapping: Record<string, unknown> }
    input.mapping.nameAsInt = { from: 'item.name' } // "Widget"/"Gadget": text, not a number
    await post(server, { type: 'save-recipe', path: inputPath, recipe: input })

    const { rejected, finished } = await runSample(server, 'products')

    expect(finished.emitted).toBe(0)
    expect(finished.rejected).toBe(2)
    expect(rejected).toHaveLength(2)
    expect(rejected.every(entry => entry.field === 'nameAsInt')).toBe(true)
    expect(rejected[0].reason).toMatch(/integer/)
  }, 30000)

  it('click a missing cell: the Why? sentence names the step that binds its source', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder()
    const inputPath = join(folder, 'products.input.json')
    const outputPath = join(folder, 'product.output.json')
    await post(server, { type: 'open-workspace', folder })

    const output = JSON.parse(readFileSync(outputPath, 'utf8')) as { fields: Record<string, unknown> }
    output.fields.missingText = { type: 'string', required: false }
    await post(server, { type: 'save-recipe', path: outputPath, recipe: output })

    const input = JSON.parse(readFileSync(inputPath, 'utf8')) as { mapping: Record<string, unknown> }
    input.mapping.missingText = { from: 'item.notOnTheFixture' }
    await post(server, { type: 'save-recipe', path: inputPath, recipe: input })

    const { records, finished } = await runSample(server, 'products')
    expect(finished.emitted).toBe(2)
    expect(records[0].data?.missingText).toBeNull()

    const why = await post<WhyView>(server, { type: 'explain-why', target: { kind: 'missing', recipeId: 'products', recordIndex: 0, field: 'missingText' } })

    expect(why.field).toBe('missingText')
    expect(why.sentence).toContain('"missingText" is missing')
    // The forEach step (`as: "item"`, steps.2 of products.input.json) is what binds "item": naming it, and its
    // path, is the Why? tab's whole point — a link straight back to the step responsible.
    expect(why.sentence).toContain('steps.2')
    expect(why.sentence).toContain('"item"')
    expect(why.stepPath).toBe('steps.2')
  }, 30000)
})
