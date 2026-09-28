import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { PdfDocumentView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

/**
 * The content pane's PDF canvas data for a PDF snapshot (`pdf-view`, studio
 * plan §3.4, issue #94's 5b), off the same cached snapshot `useSnapshotQuery`
 * reads — pass `enabled: false` until that query has actually succeeded with
 * `format: "pdf"` (`pdf-view` throws server-side otherwise).
 *
 * @param recipeId - The recipe to read; `undefined` disables the query.
 * @param stepPath - The step to read after; `undefined` disables the query.
 * @param enabled - An extra gate (default `true`), for "only once the snapshot query has resolved with a pdf format".
 * @returns The query result; `data` is every page's cells and rows.
 */
export function usePdfViewQuery (recipeId: string | undefined, stepPath: string | undefined, enabled = true): UseQueryResult<PdfDocumentView, Error> {
  const client = useStudioClient()

  return useQuery({
    queryKey: ['pdf-view', recipeId, stepPath],
    queryFn:  () => client.pdfView(recipeId as string, stepPath as string),
    enabled:  enabled && recipeId !== undefined && stepPath !== undefined,
  })
}
