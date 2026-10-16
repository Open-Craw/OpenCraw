import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import type { InferSelectorView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

export interface InferSelectorInput {
  recipeId: string
  path:     string
  nodeIds:  [string] | [string, string]
  /** The selector of the items of a list the recipe already loops over: a pick inside one of them comes back as a field of the item. */
  within?:  string
}

/**
 * Turns one or two picked nodes into a verified selector (`infer-selector`):
 * one click's node id for a `Read` card's field, two similar clicks' ids for
 * the safe item+field list shape (studio plan §3.2, issue #91). The content
 * pane calls this once it has the node id(s) from a click in the iframe; the
 * result decides whether the card is built as a single field or the safe
 * `extract`+`forEach` loop.
 *
 * @returns The mutation; call `.mutateAsync({ recipeId, path, nodeIds })`.
 */
export function useInferSelectorMutation (): UseMutationResult<InferSelectorView, Error, InferSelectorInput> {
  const client = useStudioClient()

  return useMutation({
    mutationFn: ({ recipeId, path, nodeIds, within }: InferSelectorInput) => client.inferSelector(recipeId, path, nodeIds, within),
  })
}
