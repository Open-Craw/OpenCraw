import { useStudioClient, useSaveRecipeMutation } from '../studio-client'
import { useStudioUiStore } from '../studio-store'
import { documentRecipeFiles, recipeIdFromFileName, uniqueRecipeId } from './new-recipe.mapper'

/**
 * Starts a recipe from a document already in the workspace folder (issue #120's
 * flow, once the file is there): lists the folder to find a free recipe id,
 * saves an `api` recipe pair reading the document by its `file:` URL, opens the
 * folder when it is not the open one, and selects the new recipe. Shared by
 * the drop flow, which copies bytes first, and the open-by-path flow (issue
 * #235), where the server has already put the file in place.
 *
 * @returns The function: the folder, the document's file name and its `file:` URL.
 */
export function useStartRecipeFromDocument (): (folder: string, fileName: string, url: string) => Promise<void> {
  const client = useStudioClient()
  const saveRecipe = useSaveRecipeMutation()
  const commitFolder = useStudioUiStore(state => state.commitFolder)
  const selectRecipe = useStudioUiStore(state => state.selectRecipe)

  return async (folder, fileName, url) => {
    const listing = await client.openWorkspace(folder)
    const taken = listing.recipes.map(recipe => recipe.id).filter((id): id is string => id !== undefined)
    const id = uniqueRecipeId(recipeIdFromFileName(fileName), taken)
    const files = documentRecipeFiles(folder, id, url)
    await saveRecipe.mutateAsync({ path: files.outputPath, recipe: files.output })
    await saveRecipe.mutateAsync({ path: files.inputPath, recipe: files.input })
    if (useStudioUiStore.getState().openFolder !== folder) commitFolder(folder)
    selectRecipe(id)
  }
}
