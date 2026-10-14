import { useQueryClient } from '@tanstack/react-query'
import type { RecipeListing, WorkspaceView } from '@opencraw/studio'
import { useSaveRecipeMutation, workspaceQueryKey } from '../studio-client'
import { useStudioUiStore } from '../studio-store'
import { planLoad } from './load-source.algorithm'
import type { LoadSource } from './load-source.algorithm'

function parsed (text: string | undefined): unknown {
  if (text === undefined) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/** The file name of a `file:` URL or the host of a page address: what the notice calls the thing that was loaded. */
function labelOf (source: LoadSource, label: string): string {
  return source.kind === 'document' ? label : source.url
}

/**
 * What "Load" does with the recipe that is open (see {@link planLoad}): a
 * source of the kind it already reads replaces its start address and is saved;
 * anything else, or no open recipe, runs `startNew`, which makes a recipe of
 * its own.
 *
 * @returns The function: the source, its label for messages and how to start a new recipe from it; it resolves to a note for the person when the open recipe was changed or deliberately left alone, `undefined` otherwise.
 */
export function useLoadSource (): (source: LoadSource, label: string, startNew: () => Promise<void>) => Promise<string | undefined> {
  const queryClient = useQueryClient()
  const saveRecipe = useSaveRecipeMutation()

  return async (source, label, startNew) => {
    // Read from the workspace cache when asked, not subscribed to it: a flow that only runs on a drop or a choice must not fetch the folder on mount.
    const { openFolder, selectedRecipeId } = useStudioUiStore.getState()
    const selected: RecipeListing | undefined = openFolder === undefined
      ? undefined
      : queryClient.getQueryData<WorkspaceView>(workspaceQueryKey(openFolder))?.recipes.find(recipe => recipe.id === selectedRecipeId)
    const plan = planLoad(parsed(selected?.text), source)
    if (selected !== undefined && plan.kind === 'replace') {
      await saveRecipe.mutateAsync({ path: selected.file, recipe: plan.recipe })

      return `Loaded ${labelOf(source, label)} into “${selected.id ?? selected.file}”${plan.previous === undefined ? '' : `, replacing ${plan.previous}`}.`
    }
    await startNew()
    if (selected === undefined) return

    return `“${selected.id ?? selected.file}” reads ${source.kind === 'document' ? 'a web page' : 'a document'}, so ${labelOf(source, label)} started a new recipe instead. “${selected.id ?? selected.file}” is unchanged.`
  }
}
