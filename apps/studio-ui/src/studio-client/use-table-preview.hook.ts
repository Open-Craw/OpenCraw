import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { TablePreviewOptions, TablePreviewView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

/**
 * The PDF canvas's live preview of a `table` extract's options
 * (`table-preview`, studio plan §3.4, issue #94's 5b): a query, not a
 * mutation, so it recomputes automatically (and instantly — it is a pure
 * function of the already-loaded document, no re-fetch) every time `options`
 * changes as the person edits the header/until/columns fields.
 *
 * @param recipeId - The recipe to read; `undefined` disables the query.
 * @param stepPath - The step to read after; `undefined` disables the query.
 * @param options - The `table` extract's own options; `undefined` disables the query (nothing picked yet).
 * @returns The query result; `data.matches` are the rows to highlight, `data.error` an invalid pattern.
 */
export function useTablePreviewQuery (recipeId: string | undefined, stepPath: string | undefined, options: TablePreviewOptions | undefined): UseQueryResult<TablePreviewView, Error> {
  const client = useStudioClient()

  return useQuery({
    queryKey: ['table-preview', recipeId, stepPath, options],
    queryFn:  () => client.tablePreview(recipeId as string, stepPath as string, options as TablePreviewOptions),
    enabled:  recipeId !== undefined && stepPath !== undefined && options !== undefined,
  })
}
