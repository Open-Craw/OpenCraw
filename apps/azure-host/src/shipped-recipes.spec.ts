import { join } from 'node:path'
import { loadRecipes } from '@opencraw/core'
import { shippedRecipes } from './shipped-recipes.js'

describe('shippedRecipes', () => {
  it('ships every set in assets/recipes, and each one loads and binds', async () => {
    const sets = shippedRecipes(join(__dirname, 'assets', 'recipes'))
    expect(sets.map(set => `${set.name}@${set.version}`)).toEqual(['books-by-category@1', 'catalogue@1'])
    for (const set of sets) {
      const loaded = await loadRecipes(set.recipes)
      expect(loaded.inputs).toHaveLength(1)
    }
  })
})
