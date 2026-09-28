import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import { useStudioClient } from './use-studio-client'

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
    onSuccess:  () => { void queryClient.invalidateQueries({ queryKey: ['workspace'] }) },
  })
}
