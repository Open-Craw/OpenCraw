import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import type { WhyTarget, WhyView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

/**
 * Explains one missing or rejected value from the recipe's last sample run
 * (`explain-why`, issue #92's Why? tab) — a mutation, not a query: the Why
 * panel asks for one target at a time, when a cell is clicked, rather than
 * subscribing to anything.
 *
 * @returns The mutation; call `.mutateAsync(target)`.
 */
export function useExplainWhyMutation (): UseMutationResult<WhyView, Error, WhyTarget> {
  const client = useStudioClient()

  return useMutation({
    mutationFn: (target: WhyTarget) => client.explainWhy(target),
  })
}
