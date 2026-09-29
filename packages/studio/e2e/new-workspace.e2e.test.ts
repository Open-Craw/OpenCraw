import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'
import type { RecipeListing, WorkspaceView } from '../src/studio-api'

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
  if (response.status !== 200) throw new Error(`${response.status} on ${JSON.stringify(body)}: ${await response.text()}`)

  return response.json() as Promise<T>
}

describe('opening a plain folder with no recipes yet, and composing one from scratch (#110)', () => {
  let server: StudioServer
  afterEach(async () => { await server?.close() })

  it('opens an empty folder with an empty listing, then picks up a new input/output pair after they are saved', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-new-workspace-'))

    const empty = await post<WorkspaceView>(server, { type: 'open-workspace', folder })
    expect(empty.recipes).toEqual([])

    const output = { kind: 'output', id: 'widgets', version: 1, fields: {} }
    const input = {
      kind:    'input',
      id:      'widgets',
      output:  'widgets',
      mode:    'web',
      start:   [{ url: 'https://shop.example/widgets' }],
      steps:   [{ type: 'goto', url: '{{start.url}}' }, { type: 'emit' }],
      mapping: {},
    }
    await post(server, { type: 'save-recipe', path: join(folder, 'widgets.output.json'), recipe: output })
    await post(server, { type: 'save-recipe', path: join(folder, 'widgets.input.json'), recipe: input })

    const reopened = await post<WorkspaceView>(server, { type: 'open-workspace', folder })
    const byKind = (kind: 'input' | 'output'): RecipeListing | undefined => reopened.recipes.find(recipe => recipe.kind === kind)
    expect(byKind('input')).toMatchObject({ id: 'widgets', issues: [] })
    expect(byKind('output')).toMatchObject({ id: 'widgets', issues: [] })
    expect(byKind('input')?.outline?.steps).toHaveLength(2)
  })
})
