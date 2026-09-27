import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RecipeValidationError } from '../recipe-schema'
import { bindRecipeSet, loadRecipeSet, loadRecipes } from './load-recipe-set.use-case'
import { RecipeBindingError } from './recipe-binding.error'

const fixtures = join(__dirname, '..', 'recipe-schema', 'fixtures')

describe('loadRecipeSet', () => {
  it('loads an output file and input files in the order given', async () => {
    const set = await loadRecipeSet({ output: join(fixtures, 'product.output.json'), inputs: [join(fixtures, 'shop-api.input.json'), join(fixtures, 'shop-web.input.json')] })
    expect(set.output.id).toBe('product')
    expect(set.inputs.map(input => input.id)).toEqual(['shop-api', 'shop-web'])
  })

  it('loads a directory, picking the output recipe by kind', async () => {
    const set = await loadRecipeSet({ output: fixtures, inputs: [fixtures] })
    expect(set.output.id).toBe('product')
    expect(set.inputs.map(input => input.id)).toEqual(['shop-api', 'shop-web'])
  })

  it('accepts already-decoded recipes', async () => {
    const output = { kind: 'output', id: 'o', version: 1, fields: { a: { type: 'string' } } }
    const input = { kind: 'input', id: 'i', output: 'o', mode: 'api', start: [{ url: 'http://x' }], steps: [{ type: 'request', id: 'r', url: '{{start.url}}' }, { type: 'emit' }], mapping: { a: { from: 'r' } } }
    const set = await loadRecipeSet({ output, inputs: [input] })
    expect(set.inputs).toHaveLength(1)
  })

  it('takes JSON Lines and bytes on either side, skipping the output recipe among the inputs', async () => {
    const output = { kind: 'output', id: 'o', version: 1, fields: { a: { type: 'string' } } }
    const input = { kind: 'input', id: 'i', output: 'o', mode: 'api', start: [{ url: 'http://x' }], steps: [{ type: 'request', id: 'r', url: '{{start.url}}' }, { type: 'emit' }], mapping: { a: { from: 'r' } } }
    const bundle = `${JSON.stringify(output)}\n${JSON.stringify(input)}`
    const set = await loadRecipeSet({ output: bundle, inputs: [Buffer.from(bundle)] })
    expect(set.inputs.map(recipe => recipe.id)).toEqual(['i'])
    await expect(loadRecipeSet({ output, inputs: [{ ...output, id: 'other' }] })).rejects.toMatchObject({ source: 'inputs[0]' })
  })

  it('reports invalid JSON with the file path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'recipes-'))
    const path = join(directory, 'broken.json')
    await writeFile(path, '{ not json')
    await expect(loadRecipeSet({ output: path, inputs: [] })).rejects.toThrow(/broken\.json: not valid JSON/)
  })

  it('resolves the relative file: URLs of a recipe file against its folder, and leaves a recipe object\'s alone', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'recipes-'))
    const folder = join(directory, 'listini')
    await mkdir(folder)
    const output = { kind: 'output', id: 'o', version: 1, fields: { a: { type: 'string' } } }
    const recipe = {
      kind:    'input',
      id:      'i',
      output:  'o',
      mode:    'api',
      vars:    { archive: 'file:../archive/' },
      start:   [{ url: 'file:data/listino.csv', vars: { note: 'file:./note.md' } }, { url: 'file:///srv/listino.csv' }],
      steps:   [{ type: 'request', id: 'r', url: '{{start.url}}' }, { type: 'request', url: 'file:data/{{ vars.month }}.csv' }, { type: 'paginate', next: { url: 'file:next.csv' }, steps: [{ type: 'emit' }] }],
      mapping: { a: { from: 'r' } },
    }
    await writeFile(join(folder, 'i.input.json'), JSON.stringify(recipe))
    await writeFile(join(directory, 'o.output.json'), JSON.stringify(output))
    const set = await loadRecipeSet({ output: join(directory, 'o.output.json'), inputs: [folder] })
    const inFolder = (path: string): string => pathToFileURL(join(folder, path)).href
    const [loaded] = set.inputs
    expect(loaded.start).toEqual([{ url: inFolder('data/listino.csv'), vars: { note: inFolder('note.md') } }, { url: 'file:///srv/listino.csv' }])
    expect(loaded.vars).toEqual({ archive: pathToFileURL(join(directory, 'archive')).href + '/' })
    expect(loaded.steps).toMatchObject([{ url: '{{start.url}}' }, { url: `${inFolder('data')}/{{ vars.month }}.csv` }, { next: { url: inFolder('next.csv') } }])
    const fromObject = await loadRecipeSet({ output, inputs: [recipe] })
    expect(fromObject.inputs[0].start[0].url).toBe('file:data/listino.csv')
  })

  it('refuses a start URL that is not absolute, naming the file', async () => {
    const output = { kind: 'output', id: 'o', version: 1, fields: { a: { type: 'string' } } }
    const directory = await mkdtemp(join(tmpdir(), 'recipes-'))
    const path = join(directory, 'i.input.json')
    await writeFile(path, JSON.stringify({ ...input('i'), start: [{ url: './listino.csv' }] }))
    const loading = loadRecipeSet({ output, inputs: [path] })
    await expect(loading).rejects.toThrow(RecipeValidationError)
    await expect(loading).rejects.toThrow(`${path}: invalid recipe\n  start.0.url: "./listino.csv" is not an absolute URL, and a start point has no page to resolve it against`)
  })

  it('fails validation before binding', async () => {
    await expect(loadRecipeSet({ output: { kind: 'output', id: 'o', version: 1, fields: {} }, inputs: [{ kind: 'input' }] })).rejects.toThrow(RecipeValidationError)
  })
})

function input (id: string): object {
  return { kind: 'input', id, output: 'o', mode: 'api', start: [{ url: 'http://x' }], steps: [{ type: 'request', id: 'r', url: '{{start.url}}' }, { type: 'emit' }], mapping: { a: { from: 'r' } } }
}

describe('loadRecipes', () => {
  const output = { kind: 'output', id: 'o', version: 1, fields: { a: { type: 'string' } } }

  it('finds the output recipe by kind in one bag of recipes, whatever the form', async () => {
    const jsonLines = [input('i1'), output, input('i2')].map(recipe => JSON.stringify(recipe)).join('\n')
    for (const source of [[input('i1'), output, input('i2')], jsonLines, Buffer.from(jsonLines), new Blob([jsonLines])]) {
      const set = await loadRecipes(source)
      expect(set.output.id).toBe('o')
      expect(set.inputs.map(recipe => recipe.id)).toEqual(['i1', 'i2'])
    }
  })

  it('loads a directory holding both kinds', async () => {
    const set = await loadRecipes(fixtures)
    expect(set.inputs.map(recipe => recipe.id)).toEqual(['shop-api', 'shop-web'])
  })

  it('needs exactly one output recipe, and names a bad line', async () => {
    await expect(loadRecipes([input('i1')])).rejects.toThrow('expected exactly one output recipe, found 0')
    await expect(loadRecipes([output, output])).rejects.toThrow('found 2: recipes[0], recipes[1]')
    await expect(loadRecipes(`${JSON.stringify(output)}\n{"kind":"input"}`)).rejects.toMatchObject({ source: 'recipes:2' })
  })
})

describe('bindRecipeSet', () => {
  it('rejects an input that names another output', () => {
    const output = { kind: 'output' as const, id: 'o', version: 1, fields: {} }
    const input = { kind: 'input' as const, id: 'i', output: 'other', mode: 'api' as const, start: [{ url: 'x' }], steps: [{ type: 'emit' as const }], mapping: {} }
    expect(() => bindRecipeSet(output, [input])).toThrow(/target output "other"/)
  })

  it('throws a RecipeBindingError listing every issue', () => {
    const output = { kind: 'output' as const, id: 'o', version: 1, fields: { a: { type: 'string' as const, required: true } } }
    const input = { kind: 'input' as const, id: 'i', output: 'o', mode: 'api' as const, start: [{ url: 'x' }], steps: [{ type: 'emit' as const }], mapping: { b: { from: 'nothing' } } }
    expect(() => bindRecipeSet(output, [input])).toThrow(RecipeBindingError)
  })

  it('fails the load on a default that cannot fill its field, or a default policy without one (#78)', () => {
    const output = { kind: 'output' as const, id: 'o', version: 1, fields: { n: { type: 'number' as const, default: 'none' }, m: { type: 'number' as const, onMissing: 'default' as const } } }
    const input = { kind: 'input' as const, id: 'i', output: 'o', mode: 'api' as const, start: [{ url: 'x' }], steps: [{ type: 'emit' as const }], mapping: {} }
    expect(() => bindRecipeSet(output, [input])).toThrow([
      'recipes do not bind',
      '  o fields.n.default: "none" is not a valid default: number field: no number in "none"',
      '  o fields.m.onMissing: "m" has onMissing "default" but no default',
    ].join('\n'))
    expect(() => bindRecipeSet({ ...output, fields: { n: { type: 'number', default: '0' } } }, [input])).not.toThrow()
  })
})
