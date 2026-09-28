import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openWorkspace } from './open-workspace.use-case'

function folderOf (files: Record<string, unknown>): string {
  const folder = mkdtempSync(join(tmpdir(), 'opencraw-workspace-'))
  for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, name), JSON.stringify(content))

  return folder
}

describe('openWorkspace', () => {
  it('lists a clean pair with no issues', async () => {
    const folder = folderOf({
      'book.output.json': { kind: 'output', id: 'book', version: 1, fields: { title: { type: 'string', required: true, key: true } } },
      'books.input.json': { kind: 'input', id: 'books', output: 'book', mode: 'api', start: [{ url: 'file:///a.json' }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}', as: 'json' }, { type: 'emit' }], mapping: { title: { from: 'doc.title' } } },
    })
    const view = await openWorkspace(folder)
    expect(view.folder).toBe(folder)
    expect(view.recipes).toHaveLength(2)
    for (const recipe of view.recipes) expect(recipe.issues).toEqual([])
    const kinds = view.recipes.map(recipe => recipe.kind).sort((a, b) => a.localeCompare(b))
    expect(kinds).toEqual(['input', 'output'])
    const output = view.recipes.find(recipe => recipe.kind === 'output')
    expect(JSON.parse(output?.text ?? '')).toMatchObject({ kind: 'output', id: 'book' })
  })

  it('gives every input recipe its outline, and no output/unknown recipe one', async () => {
    const folder = folderOf({
      'book.output.json': { kind: 'output', id: 'book', version: 1, fields: { title: { type: 'string', required: true, key: true } } },
      'books.input.json': { kind: 'input', id: 'books', output: 'book', mode: 'api', start: [{ url: 'file:///a.json' }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}', as: 'json' }, { type: 'emit' }], mapping: { title: { from: 'doc.title' } } },
    })
    const view = await openWorkspace(folder)
    const input = view.recipes.find(recipe => recipe.kind === 'input')
    const output = view.recipes.find(recipe => recipe.kind === 'output')
    expect(input?.outline?.steps).toHaveLength(2)
    expect(input?.outline?.steps[0]).toMatchObject({ path: 'steps.0', stepType: 'request' })
    expect(output?.outline).toBeUndefined()
  })

  it('still gives an outline (of custom cards) for an input recipe that fails validation', async () => {
    const folder = folderOf({ 'books.input.json': { kind: 'input', steps: [{ type: 'goto', url: '/' }] } })
    const view = await openWorkspace(folder)
    expect(view.recipes[0].issues.length).toBeGreaterThan(0)
    expect(view.recipes[0].outline?.steps).toHaveLength(1)
  })

  it('reports a binding issue on the input, with its JSON path', async () => {
    const folder = folderOf({
      'book.output.json': { kind: 'output', id: 'book', version: 1, fields: { title: { type: 'string', required: true, key: true } } },
      'books.input.json': { kind: 'input', id: 'books', output: 'book', mode: 'api', start: [{ url: 'file:///a.json' }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}', as: 'json' }, { type: 'emit' }], mapping: { price: { from: 'doc.price' } } },
    })
    const view = await openWorkspace(folder)
    const input = view.recipes.find(recipe => recipe.kind === 'input')
    expect(input?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'mapping.price', kind: 'binding' }),
    ]))
  })

  it('reports a validation issue with a JSON path on a recipe that does not parse', async () => {
    const folder = folderOf({ 'book.output.json': { kind: 'output', id: 'book' } })
    const view = await openWorkspace(folder)
    expect(view.recipes[0].kind).toBe('output')
    expect(view.recipes[0].id).toBeUndefined()
    expect(view.recipes[0].issues.length).toBeGreaterThan(0)
    expect(view.recipes[0].issues[0].kind).toBe('validation')
  })

  it('reports an input whose named output is missing from the workspace', async () => {
    const folder = folderOf({
      'books.input.json': { kind: 'input', id: 'books', output: 'missing', mode: 'api', start: [{ url: 'file:///a.json' }], steps: [{ type: 'request', id: 'doc', url: '{{start.url}}', as: 'json' }, { type: 'emit' }], mapping: {} },
    })
    const view = await openWorkspace(folder)
    expect(view.recipes[0].issues).toEqual([{ path: 'output', message: 'no output recipe "missing" in this workspace', kind: 'binding' }])
  })

  it('marks a file with no recognizable "kind" as unknown', async () => {
    const folder = folderOf({ 'notes.json': { hello: 'world' } })
    const view = await openWorkspace(folder)
    expect(view.recipes[0].kind).toBe('unknown')
  })
})
