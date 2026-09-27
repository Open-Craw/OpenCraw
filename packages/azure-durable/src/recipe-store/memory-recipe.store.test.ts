import { findRecipes } from './find-recipes.use-case'
import { memoryRecipes } from './memory-recipe.store'

describe('memoryRecipes', () => {
  it('serves shipped recipes as promoted, drafts as drafts, and never overwrites a version', async () => {
    const store = memoryRecipes([{ name: 'shop', version: '1', recipes: [{ kind: 'output' }] }])
    await expect(store.get('shop', '1')).resolves.toMatchObject({ state: 'promoted' })
    await store.put({ name: 'shop', version: '2', recipes: [] })
    await expect(store.get('shop', '2')).resolves.toMatchObject({ state: 'draft' })
    await expect(store.put({ name: 'shop', version: '2', recipes: [] })).rejects.toMatchObject({ status: 409 })
    await store.promote('shop', '2')
    expect(await store.list()).toEqual([{ name: 'shop', version: '1', state: 'promoted' }, { name: 'shop', version: '2', state: 'promoted' }])
    await expect(store.promote('shop', '9')).rejects.toMatchObject({ status: 404 })
  })
})

describe('findRecipes', () => {
  it('finds a promoted version, and refuses a missing one (404) or a draft (409) unless drafts will do', async () => {
    const store = memoryRecipes([{ name: 'shop', version: '1', recipes: [] }, { name: 'shop', version: '2', recipes: [], state: 'draft' }])
    await expect(findRecipes(store, 'shop', '1')).resolves.toMatchObject({ version: '1' })
    await expect(findRecipes(store, 'shop', '3')).rejects.toMatchObject({ status: 404 })
    await expect(findRecipes(undefined, 'shop', '1')).rejects.toMatchObject({ status: 404 })
    await expect(findRecipes(store, 'shop', '2')).rejects.toMatchObject({ status: 409 })
    await expect(findRecipes(store, 'shop', '2', true)).resolves.toMatchObject({ state: 'draft' })
  })
})
