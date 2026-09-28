import { copyFileSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveRecipe } from './save-recipe.use-case'

function recipeFilesUnder (dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...recipeFilesUnder(path))
    else if (name.endsWith('.input.json') || name.endsWith('.output.json')) out.push(path)
  }

  return out
}

describe('saveRecipe', () => {
  it('writes pretty JSON with a 2-space indent and a trailing newline', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-save-'))
    const file = join(folder, 'thing.output.json')
    await saveRecipe(file, { kind: 'output', id: 'thing', fields: { name: { type: 'string' } } })
    const text = readFileSync(file, 'utf8')
    expect(text).toBe('{\n  "kind": "output",\n  "id": "thing",\n  "fields": {\n    "name": {\n      "type": "string"\n    }\n  }\n}\n')
  })

  // The guide's and the examples' recipes are hand-formatted (aligned values, wrapped arrays); saving them
  // back is a full replacement, so this asserts the weaker, honest guarantee: the parsed value round-trips,
  // not the file's exact bytes (see save-recipe.use-case.ts for why).
  describe('round-trips every recipe under docs/how-it-works/recipes/ and examples/', () => {
    const root = join(__dirname, '..', '..', '..', '..')
    const files = [...recipeFilesUnder(join(root, 'docs', 'how-it-works', 'recipes')), ...recipeFilesUnder(join(root, 'examples'))]
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-round-trip-'))

    it(`found recipe files to round-trip (${files.length})`, () => {
      expect(files.length).toBeGreaterThan(50)
    })

    it.each(files.map(file => [file.slice(root.length + 1), file]))('%s', async (_label, file) => {
      const before: unknown = JSON.parse(readFileSync(file, 'utf8'))
      const copy = join(folder, `${files.indexOf(file)}.json`)
      copyFileSync(file, copy)
      await saveRecipe(copy, before)
      const after: unknown = JSON.parse(readFileSync(copy, 'utf8'))
      expect(after).toEqual(before)
    })
  })
})
