import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import { startChanged } from './start-changed.algorithm'
import { useStudioClient } from './use-studio-client.hook'

export interface SaveRecipeInput {
  path:   string
  recipe: unknown
}

/**
 * Saves the JSON tab's edits (`save-recipe`) and invalidates the workspace
 * query on success, so the JSON/Steps tabs both re-render from the server's
 * authoritative, re-validated copy. Replaces `app.tsx`'s old
 * `saveRecipe` → `open(folder)` full reload: the server's own
 * `workspace-changed` broadcast (`studio-client/use-studio-events.ts`) does
 * the same invalidation for every other connected client, this `onSuccess`
 * just makes it immediate for the tab that made the edit.
 *
 * @returns The mutation; call `.mutateAsync({ path, recipe })`. Resolves to `void`: `StudioClient.saveRecipe`
 * already discards the server's `{ saved: true }` ack, which carries nothing a caller needs.
 */
export function useSaveRecipeMutation (): UseMutationResult<void, Error, SaveRecipeInput> {
  const client = useStudioClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, recipe }: SaveRecipeInput) => client.saveRecipe(path, recipe),
    onMutate:   ({ path }) => ({ previousText: listedText(queryClient, path) }),
    onSuccess:  async (_result, { recipe }, context) => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
      if (!startChanged(context.previousText, recipe)) return
      // The recipe now reads another document or page: what was drawn from the old one is stale. The snapshot is taken
      // again first: the views of it (PDF cells, grid, previews) are answered from the server's copy of it.
      await queryClient.invalidateQueries({ queryKey: ['snapshot'] })
      void queryClient.invalidateQueries({ predicate: query => query.queryKey[0] !== 'workspace' && query.queryKey[0] !== 'snapshot' })
    },
  })
}

/** The recipe file's text as the workspace listing last held it. */
function listedText (queryClient: QueryClient, path: string): string | undefined {
  const cached = queryClient.getQueriesData<{ recipes?: { file: string, text: string }[] }>({ queryKey: ['workspace'] })
  for (const [, data] of cached) {
    const found = data?.recipes?.find(listing => listing.file === path)
    if (found !== undefined) return found.text
  }

  return undefined
}
