import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { WorkbookDocumentView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

/** A CSV's delimiter/encoding, overriding what was auto-detected (issue #94's 5c). */
export interface GridViewOverride {
  delimiter?: string
  encoding?:  string
}

/**
 * The content pane's grid canvas data for a CSV/spreadsheet snapshot
 * (`grid-view`, studio plan §3.4, issue #94's 5c), off the same cached
 * snapshot `useSnapshotQuery` reads — pass `enabled: false` until that query
 * has actually succeeded with a `format` the grid canvas handles (`grid-view`
 * throws server-side otherwise).
 *
 * @param recipeId - The recipe to read; `undefined` disables the query.
 * @param stepPath - The step to read after; `undefined` disables the query.
 * @param enabled - An extra gate (default `true`), for "only once the snapshot query has resolved with a csv/xlsx format".
 * @param override - A CSV's overridden delimiter/encoding, shown and editable on the grid canvas; `undefined` reads the auto-detected format.
 * @returns The query result; `data` is every sheet's cells, typed.
 */
export function useGridViewQuery (recipeId: string | undefined, stepPath: string | undefined, enabled = true, override?: GridViewOverride): UseQueryResult<WorkbookDocumentView, Error> {
  const client = useStudioClient()

  return useQuery({
    queryKey: ['grid-view', recipeId, stepPath, override],
    queryFn:  () => client.gridView(recipeId as string, stepPath as string, override),
    enabled:  enabled && recipeId !== undefined && stepPath !== undefined,
  })
}
