import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { outlineToRecipe } from './outline-to-recipe.mapper'
import { recipeToOutline } from './recipe-to-outline.mapper'
import type { OutlineBracket } from './outline.model'

function recipeFilesUnder (dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...recipeFilesUnder(path))
    else if (name.endsWith('.json')) out.push(path)
  }

  return out
}

describe('outlineToRecipe', () => {
  it('is the inverse of recipeToOutline for a plain recipe', () => {
    const content = { kind: 'input', id: 'x', mode: 'web', start: [{ url: '/' }], steps: [{ type: 'goto', url: '/' }, { type: 'emit' }], mapping: {} }
    expect(outlineToRecipe(recipeToOutline(content))).toEqual(content)
  })

  it('rebuilds a forEach, keeping every other field and putting "steps" back where it was', () => {
    const content = { steps: [{ type: 'forEach', as: 'x', over: 'xs', emit: true, steps: [{ type: 'emit' }] }] }
    expect(outlineToRecipe(recipeToOutline(content))).toEqual(content)
  })

  it('rebuilds an if with both branches', () => {
    const content = { steps: [{ type: 'if', test: '{{x}}', steps: [{ type: 'emit' }], else: [{ type: 'set', id: 'y', value: 0 }] }] }
    expect(outlineToRecipe(recipeToOutline(content))).toEqual(content)
  })

  it('does not invent a steps key on a recipe that never had one (an output recipe)', () => {
    const content = { kind: 'output', id: 'x', fields: {} }
    expect(outlineToRecipe(recipeToOutline(content))).toEqual(content)
  })

  it('keeps key order even when "steps" sits before another field in the source', () => {
    const content = { steps: [{ type: 'if', steps: [{ type: 'emit' }], test: '{{x}}', else: [] }] }
    const rebuilt = outlineToRecipe(recipeToOutline(content))
    expect(Object.keys((rebuilt.steps as Record<string, unknown>[])[0])).toEqual(['type', 'steps', 'test', 'else'])
    expect(rebuilt).toEqual(content)
  })

  it('adds "steps" (and "else", if edited in) for a bracket a "+" menu just built, with no steps field yet', () => {
    const outline = recipeToOutline({ steps: [] })
    const built: OutlineBracket = { kind: 'bracket', path: 'steps.0', stepType: 'forEach', sentence: [], step: { type: 'forEach', as: 'x', over: 'xs' }, children: [] }
    outline.steps.push(built)
    expect(outlineToRecipe(outline)).toEqual({ steps: [{ type: 'forEach', as: 'x', over: 'xs', steps: [] }] })
  })

  it('outline → recipe → outline is the identity for a hand-built outline', () => {
    const content = {
      kind:  'input',
      steps: [
        { type: 'set', id: 'authors', value: [] },
        {
          type:  'paginate',
          next:  { selector: 'a.next' },
          steps: [
            {
              type:  'forEach',
              as:    'book',
              over:  'books',
              emit:  true,
              steps: [
                { type: 'extract', id: 'title', selector: 'h1', kind: 'css' },
                { type: 'if', test: '{{x}}', steps: [{ type: 'emit' }], else: [{ type: 'set', id: 'y', value: 1 }] },
              ],
            },
          ],
        },
      ],
    }
    const outline = recipeToOutline(content)
    const again = recipeToOutline(outlineToRecipe(outline))
    expect(again).toEqual(outline)
  })

  describe('round-trips every recipe under docs/how-it-works/recipes/, examples/ and packages/core/src/recipe-schema/fixtures/', () => {
    const root = join(__dirname, '..', '..', '..', '..')
    const files = [
      ...recipeFilesUnder(join(root, 'docs', 'how-it-works', 'recipes')),
      ...recipeFilesUnder(join(root, 'examples')),
      ...recipeFilesUnder(join(root, 'packages', 'core', 'src', 'recipe-schema', 'fixtures')),
    ]

    it(`found recipe files to round-trip (${files.length})`, () => {
      expect(files.length).toBeGreaterThan(50)
    })

    it.each(files.map(file => [file.slice(root.length + 1), file]))('%s: recipe → outline → recipe preserves every key and its order', (_label, file) => {
      const before: unknown = JSON.parse(readFileSync(file, 'utf8'))
      const after = outlineToRecipe(recipeToOutline(before))
      expect(after).toEqual(before)
      expect(keyPathsOf(after)).toEqual(keyPathsOf(before))
    })

    it.each(files.map(file => [file.slice(root.length + 1), file]))('%s: outline → recipe → outline is the identity', (_label, file) => {
      const before: unknown = JSON.parse(readFileSync(file, 'utf8'))
      const outline = recipeToOutline(before)
      expect(recipeToOutline(outlineToRecipe(outline))).toEqual(outline)
    })
  })
})

/** Every key, at every depth, in the order `for…in`/`Object.keys` sees it: a stronger check than `toEqual`, which does not care about key order. */
function keyPathsOf (value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => keyPathsOf(item, `${prefix}[${index}]`))
  if (typeof value !== 'object' || value === null) return []

  return Object.keys(value).flatMap(key => [`${prefix}.${key}`, ...keyPathsOf((value as Record<string, unknown>)[key], `${prefix}.${key}`)])
}
