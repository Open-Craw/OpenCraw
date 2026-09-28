import type { RecipeListing } from '@opencraw/studio'
import { useStudioUiStore } from '../studio-store'
import { useWorkspaceQuery } from './use-workspace'

/**
 * The selected recipe's listing (JSON text, issues, outline), derived from
 * the workspace query's already-cached data rather than fetched again — the
 * server has no per-recipe read; `open-workspace` is the only round trip
 * that returns a recipe's JSON/outline.
 *
 * @returns The selected `RecipeListing`, or `undefined` before a workspace is open or a recipe is picked.
 */
export function useSelectedRecipe (): RecipeListing | undefined {
  const openFolder = useStudioUiStore(state => state.openFolder)
  const selectedRecipeId = useStudioUiStore(state => state.selectedRecipeId)
  const workspace = useWorkspaceQuery(openFolder)

  return workspace.data?.recipes.find(recipe => recipe.id === selectedRecipeId)
}

/** Every recipe in the open workspace whose `kind` is `input`: the toolbar's recipe picker. */
export function useInputRecipes (): RecipeListing[] {
  const openFolder = useStudioUiStore(state => state.openFolder)
  const workspace = useWorkspaceQuery(openFolder)

  return workspace.data?.recipes.filter(recipe => recipe.kind === 'input') ?? []
}
