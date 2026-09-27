import type { RecipeStore, StoredRecipes } from './recipe-store.contract'
import { RecipeStoreError } from './recipe-store.error'

/**
 * A stored recipe set production may run.
 *
 * @param store - The store, if the host has one.
 * @param name - The set's name.
 * @param version - Its version.
 * @param allowDraft - Whether a draft will do (authoring tools), or only a promoted version (production).
 * @returns The set.
 * @throws RecipeStoreError 404 when there is no such version, 409 when it is a draft and a draft won't do.
 */
export async function findRecipes (store: RecipeStore | undefined, name: string, version: string, allowDraft = false): Promise<StoredRecipes> {
  const found = await store?.get(name, version)
  if (found === undefined) throw new RecipeStoreError(`no recipes "${name}" version "${version}"`, 404)
  if (!allowDraft && found.state === 'draft') throw new RecipeStoreError(`recipes "${name}" version "${version}" are a draft: promote them before production runs them`, 409)

  return found
}
