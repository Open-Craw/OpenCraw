import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import type { ResponsesSeenView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

export interface ResponsesSeenInput {
  recipeId: string
  path:     string
}

/**
 * The JSON responses seen while the recipe's start page rendered
 * (`responses-seen`, studio plan §3.3, issue #93): a mutation, not a query
 * that fires on its own — capturing opens its own browser session and takes
 * a few seconds, so the Inspect panel's "responses seen" list only calls
 * this when the person actually opens that tab or asks to check again, never
 * automatically on every recipe/step switch.
 *
 * @returns The mutation; call `.mutate({ recipeId, path })`.
 */
export function useResponsesSeenMutation (): UseMutationResult<ResponsesSeenView, Error, ResponsesSeenInput> {
  const client = useStudioClient()

  return useMutation({
    mutationFn: ({ recipeId, path }: ResponsesSeenInput) => client.responsesSeen(recipeId, path),
  })
}
