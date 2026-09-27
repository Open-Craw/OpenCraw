import type { RecipeStore, StoredRecipes } from './recipe-store.contract'
import { RecipeStoreError } from './recipe-store.error'

const keyOf = (name: string, version: string): string => `${name}@${version}`

/**
 * Recipes held in memory: the ones a deployment ships with (promoted), plus
 * drafts published while it runs, which a restart forgets.
 *
 * @param entries - The recipe sets; `state` defaults to `promoted`.
 * @returns The store.
 */
export function memoryRecipes (entries: (Omit<StoredRecipes, 'state'> & { state?: StoredRecipes['state'] })[] = []): RecipeStore {
  const byKey = new Map<string, StoredRecipes>()
  for (const entry of entries) byKey.set(keyOf(entry.name, entry.version), { ...entry, state: entry.state ?? 'promoted' })

  return {
    get:  async (name, version) => byKey.get(keyOf(name, version)),
    list: async () => Array.from(byKey.values(), ({ recipes: _recipes, ...entry }) => entry),
    put:  async (entry) => {
      const key = keyOf(entry.name, entry.version)
      if (byKey.has(key)) throw new RecipeStoreError(`recipes "${entry.name}" version "${entry.version}" exist already; publish a new version`, 409)
      byKey.set(key, { ...entry, state: 'draft' })
    },
    promote: async (name, version) => {
      const entry = byKey.get(keyOf(name, version))
      if (entry === undefined) throw new RecipeStoreError(`no recipes "${name}" version "${version}"`, 404)
      byKey.set(keyOf(name, version), { ...entry, state: 'promoted' })
    },
  }
}
