import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import type { OutlineView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client'

export interface SaveOutlineInput {
  path:    string
  outline: OutlineView
}

/**
 * Saves the Steps tab's edits (`save-outline`: the server converts the
 * outline back to the recipe's JSON) and invalidates the workspace query on
 * success — see `use-save-recipe.ts`'s doc comment for why invalidation
 * replaces the old `open(folder)` reload.
 *
 * @returns The mutation; call `.mutateAsync({ path, outline })`. Resolves to `void`, for the same reason as
 * `useSaveRecipeMutation`'s.
 */
export function useSaveOutlineMutation (): UseMutationResult<void, Error, SaveOutlineInput> {
  const client = useStudioClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, outline }: SaveOutlineInput) => client.saveOutline(path, outline),
    onSuccess:  () => { void queryClient.invalidateQueries({ queryKey: ['workspace'] }) },
  })
}
