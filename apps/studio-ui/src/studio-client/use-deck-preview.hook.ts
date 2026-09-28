import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { DeckPreviewOptions, DeckTablePreviewView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

/**
 * The deck canvas's live preview of a `table` extract's options
 * (`deck-preview`, studio plan §3.4, issue #94's 5d): a query, not a
 * mutation, so it recomputes automatically (and instantly — it is a pure
 * function of the already-loaded document, no re-fetch) every time `options`
 * changes as the person edits the slide/header/until/columns/shapes fields.
 *
 * @param recipeId - The recipe to read; `undefined` disables the query.
 * @param stepPath - The step to read after; `undefined` disables the query.
 * @param options - The `table` extract's own options; `undefined` disables the query (nothing picked yet — no header row).
 * @returns The query result; `data.matches` are the matched table(s), `data.error` an invalid pattern.
 */
export function useDeckPreviewQuery (recipeId: string | undefined, stepPath: string | undefined, options: DeckPreviewOptions | undefined): UseQueryResult<DeckTablePreviewView, Error> {
  const client = useStudioClient()

  return useQuery({
    queryKey: ['deck-preview', recipeId, stepPath, options],
    queryFn:  () => client.deckPreview(recipeId as string, stepPath as string, options as DeckPreviewOptions),
    enabled:  recipeId !== undefined && stepPath !== undefined && options !== undefined,
  })
}
