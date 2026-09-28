import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { SnapshotView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

/**
 * The content pane's snapshot for the selected recipe and step path
 * (`take-snapshot`, studio plan §3.1, issue #91) — a genuine round trip,
 * cached server-side per recipe/path (`page-snapshot`'s `snapshot.store.ts`)
 * so switching the selected step and switching straight back does not
 * recapture it; TanStack Query's own cache means switching *within* one
 * render session does not even re-request it.
 *
 * @param recipeId - The recipe to snapshot; `undefined` disables the query.
 * @param stepPath - The step to snapshot after; `undefined` disables the query.
 * @returns The query result; `data` is the rewritten snapshot.
 */
export function useSnapshotQuery (recipeId: string | undefined, stepPath: string | undefined): UseQueryResult<SnapshotView, Error> {
  const client = useStudioClient()

  return useQuery({
    queryKey: ['snapshot', recipeId, stepPath],
    queryFn:  () => client.takeSnapshot(recipeId as string, stepPath as string),
    enabled:  recipeId !== undefined && stepPath !== undefined,
  })
}
