import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { WorkspaceView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

/** The query key `open-workspace` is cached under; shared with the save mutations' invalidation and the `workspace-changed` event handler. */
export function workspaceQueryKey (folder: string | undefined): readonly unknown[] {
  return ['workspace', folder]
}

/**
 * Opens `folder` and caches its `WorkspaceView`: every recipe file, its
 * JSON text, its issues and (for an input recipe) its outline. `useRecipe`
 * and `useSelectedRecipe` read a single recipe out of this same cache entry
 * rather than fetching it again — the server's `open-workspace` handler
 * already returns every recipe in the folder in one round trip.
 *
 * @param folder - The folder to open; `undefined` (nothing committed yet, see `studio-ui.store.ts`'s `openFolder`) disables the query.
 * @returns The query result: `data`, `isLoading`, `error`, etc.
 */
export function useWorkspaceQuery (folder: string | undefined): UseQueryResult<WorkspaceView, Error> {
  const client = useStudioClient()

  return useQuery({
    queryKey: workspaceQueryKey(folder),
    queryFn:  () => client.openWorkspace(folder as string),
    enabled:  folder !== undefined,
  })
}
