import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import type { VerifySelectorView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

export interface VerifySelectorInput {
  recipeId: string
  path:     string
  selector: string
}

/**
 * Verifies a candidate selector (`verify-selector`): match counts against
 * the snapshot and, best-effort, the live page — a mutation, not a query,
 * since the card calls it once per candidate it wants checked rather than
 * subscribing to it (studio plan §3.2, issue #91).
 *
 * @returns The mutation; call `.mutateAsync({ recipeId, path, selector })`.
 */
export function useVerifySelectorMutation (): UseMutationResult<VerifySelectorView, Error, VerifySelectorInput> {
  const client = useStudioClient()

  return useMutation({
    mutationFn: ({ recipeId, path, selector }: VerifySelectorInput) => client.verifySelector(recipeId, path, selector),
  })
}
