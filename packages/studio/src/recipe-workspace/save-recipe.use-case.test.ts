import { copyFileSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
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

/** Whether the file read as whole JSON; a read that fails outright (Windows refuses a read mid-rename) is not a torn file. */
async function readsAsTornJson (file: string): Promise<boolean> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return false
  }
  try {
    JSON.parse(text)

    return false
  } catch {
    return true
  }
}

describe('saveRecipe', () => {
  it('writes pretty JSON with a 2-space indent and a trailing newline', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-save-'))
    const file = join(folder, 'thing.output.json')
    await saveRecipe(file, { kind: 'output', id: 'thing', fields: { name: { type: 'string' } } })
    const text = readFileSync(file, 'utf8')
    expect(text).toBe('{\n  "kind": "output",\n  "id": "thing",\n  "fields": {\n    "name": {\n      "type": "string"\n    }\n  }\n}\n')
  })

  // Windows refuses a rename over a file a reader has open, so there the save falls back to a plain write and this reader can see it torn.
  const itWhereRenameReplaces = process.platform === 'win32' ? it.skip : it
  itWhereRenameReplaces('never lets a reader see a half-written file (issue #194)', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-save-atomic-'))
    const file = join(folder, 'big.output.json')
    const recipe = { kind: 'output', id: 'big', fields: Object.fromEntries(Array.from({ length: 20000 }, (_, index) => [`field${String(index)}`, { type: 'string' }])) }
    await saveRecipe(file, recipe)

    let writing = true
    let torn = 0
    const reader = (async () => {
      while (writing) {
        if (await readsAsTornJson(file)) torn += 1
      }
    })()
    try {
      for (let round = 0; round < 15; round += 1) await saveRecipe(file, recipe)
    } finally {
      writing = false
      await reader
    }

    expect(torn).toBe(0)
  })

  it('leaves no temporary file behind', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-save-clean-'))
    const file = join(folder, 'thing.output.json')
    await saveRecipe(file, { kind: 'output', id: 'thing', fields: {} })
    await saveRecipe(file, { kind: 'output', id: 'thing', fields: { a: { type: 'string' } } })
    expect(readdirSync(folder)).toEqual(['thing.output.json'])
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
