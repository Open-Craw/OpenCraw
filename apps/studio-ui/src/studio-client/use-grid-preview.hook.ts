import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { GridPreviewOptions, GridTablePreviewView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

/**
 * The grid canvas's live preview of a `table` extract's options
 * (`grid-preview`, studio plan §3.4, issue #94's 5c): a query, not a
 * mutation, so it recomputes automatically (and instantly — it is a pure
 * function of the already-loaded document, no re-fetch) every time `options`
 * changes as the person edits the header/until/columns/fillDown fields.
 *
 * @param recipeId - The recipe to read; `undefined` disables the query.
 * @param stepPath - The step to read after; `undefined` disables the query.
 * @param options - The `table` extract's own options; `undefined` disables the query (nothing picked yet — no header row).
 * @returns The query result; `data.matches` are the matched table(s), `data.error` an invalid pattern.
 */
export function useGridPreviewQuery (recipeId: string | undefined, stepPath: string | undefined, options: GridPreviewOptions | undefined): UseQueryResult<GridTablePreviewView, Error> {
  const client = useStudioClient()

  return useQuery({
    queryKey: ['grid-preview', recipeId, stepPath, options],
    queryFn:  () => client.gridPreview(recipeId as string, stepPath as string, options as GridPreviewOptions),
    enabled:  recipeId !== undefined && stepPath !== undefined && options !== undefined,
  })
}
