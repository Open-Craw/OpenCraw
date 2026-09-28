import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { InspectView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

/**
 * The Inspect panel's DOM tree and data-in-the-page findings (`inspect-page`,
 * studio plan §3.3, issue #93), off the same cached snapshot `useSnapshotQuery`
 * reads — pass `enabled: false` until that query has actually succeeded
 * (`inspect-page` throws server-side otherwise: "call take-snapshot first").
 *
 * @param recipeId - The recipe to inspect; `undefined` disables the query.
 * @param stepPath - The step to inspect after; `undefined` disables the query.
 * @param enabled - An extra gate (default `true`), for "only once the snapshot query has resolved".
 * @returns The query result; `data` is the tree and the findings.
 */
export function useInspectPageQuery (recipeId: string | undefined, stepPath: string | undefined, enabled = true): UseQueryResult<InspectView, Error> {
  const client = useStudioClient()

  return useQuery({
    queryKey: ['inspect-page', recipeId, stepPath],
    queryFn:  () => client.inspectPage(recipeId as string, stepPath as string),
    enabled:  enabled && recipeId !== undefined && stepPath !== undefined,
  })
}
