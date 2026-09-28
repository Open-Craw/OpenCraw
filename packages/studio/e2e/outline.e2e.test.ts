import { cpSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startStudioServer } from '../src/studio-server'
import type { StudioServer } from '../src/studio-server'

function recipesFolder (): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-e2e-outline-'))
  cpSync(join(__dirname, 'recipes'), folder, { recursive: true })

  return folder
}

function emptyUiRoot (): string {
  return mkdtempSync(join(tmpdir(), 'opencraw-e2e-ui-'))
}

function commandUrl (server: StudioServer): string {
  return `http://127.0.0.1:${new URL(server.url).port}/api/command`
}

async function post (server: StudioServer, body: unknown): Promise<unknown> {
  const response = await fetch(commandUrl(server), {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-opencraw-token': server.token },
    body:    JSON.stringify(body),
  })
  expect(response.status).toBe(200)

  return response.json()
}

interface OutlineNode {
  kind:          string
  path:          string
  stepType:      string
  sentence:      { kind: string, text: string }[]
  step:          Record<string, unknown>
  custom?:       boolean
  children?:     OutlineNode[]
  elseChildren?: OutlineNode[]
}

interface Outline {
  recipe: Record<string, unknown>
  steps:  OutlineNode[]
}

interface RecipeListing {
  file:     string
  kind:     string
  id?:      string
  issues:   { path: string, message: string, kind: string }[]
  outline?: Outline
}

describe('studio phase 1: the Steps outline, over the real server', () => {
  let server: StudioServer

  afterEach(async () => { await server?.close() })

  it('fetches a recipe\'s outline as part of open-workspace', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder()

    const workspace = await post(server, { type: 'open-workspace', folder }) as { recipes: RecipeListing[] }
    const products = workspace.recipes.find(recipe => recipe.id === 'products')

    expect(products?.outline).toBeDefined()
    expect(products?.outline?.steps).toHaveLength(3)
    expect(products?.outline?.steps[2]).toMatchObject({ kind: 'bracket', path: 'steps.2', stepType: 'forEach' })
  })

  it('edits the outline via save-outline (adds a Read inside the forEach) and the saved file has it', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder()
    const path = join(folder, 'products.input.json')

    const workspace = await post(server, { type: 'open-workspace', folder }) as { recipes: RecipeListing[] }
    const products = workspace.recipes.find(recipe => recipe.id === 'products')
    const outline = products?.outline
    if (outline === undefined) throw new Error('expected an outline')

    const loop = outline.steps[2]
    if (loop.kind !== 'bracket') throw new Error('expected steps.2 to be a bracket')
    const withRead: Outline = {
      ...outline,
      steps: outline.steps.map((node, index) => (
        index === 2
          ? { ...loop, children: [{ kind: 'card', path: 'steps.2.steps.0', stepType: 'extract', sentence: [], step: { type: 'extract', id: 'title', from: 'item', selector: 'name', kind: 'jsonpath' }, custom: false }] }
          : node
      )),
    }

    await post(server, { type: 'save-outline', path, outline: withRead })

    const saved = JSON.parse(readFileSync(path, 'utf8')) as { steps: { type: string, steps?: unknown[] }[] }
    expect(saved.steps[2].steps).toEqual([{ type: 'extract', id: 'title', from: 'item', selector: 'name', kind: 'jsonpath' }])
  })

  it('renaming a loop\'s "as" to an already-bound name shows a binding issue on that step\'s path', async () => {
    server = await startStudioServer({ uiRoot: emptyUiRoot() })
    const folder = recipesFolder()
    const path = join(folder, 'products.input.json')

    const workspace = await post(server, { type: 'open-workspace', folder }) as { recipes: RecipeListing[] }
    const products = workspace.recipes.find(recipe => recipe.id === 'products')
    const outline = products?.outline
    if (outline === undefined) throw new Error('expected an outline')

    const loop = outline.steps[2]
    if (loop.kind !== 'bracket') throw new Error('expected steps.2 to be a bracket')
    // "items" is already bound (the extract right above the loop); renaming "as" to it should clash.
    const renamed: Outline = {
      ...outline,
      steps: outline.steps.map((node, index) => (index === 2 ? { ...loop, step: { ...loop.step, as: 'items' } } : node)),
    }

    await post(server, { type: 'save-outline', path, outline: renamed })
    const reopened = await post(server, { type: 'open-workspace', folder }) as { recipes: RecipeListing[] }
    const reopenedProducts = reopened.recipes.find(recipe => recipe.id === 'products')

    expect(reopenedProducts?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'steps.2.as', kind: 'binding' }),
    ]))
  })
})
