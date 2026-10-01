import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { RegionPreviewView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

/**
 * The PDF canvas's live preview of a `region` extract's selector
 * (`region-preview`, issue #121): a query, not a mutation, so it recomputes
 * automatically (and instantly — a pure function of the already-loaded
 * document) every time the selector changes as the person snaps or drags
 * the box. `placeholderData` keeps the last answer on screen while the next
 * computes, so the highlight does not flicker between two boxes.
 *
 * @param recipeId - The recipe to read; `undefined` disables the query.
 * @param stepPath - The step to read after; `undefined` disables the query.
 * @param selector - The `region` selector; `undefined` disables the query (nothing selected yet).
 * @returns The query result; `data.matches` are the cells to highlight and the text, `data.error` a selector that does not parse.
 */
export function useRegionPreviewQuery (recipeId: string | undefined, stepPath: string | undefined, selector: string | undefined): UseQueryResult<RegionPreviewView, Error> {
  const client = useStudioClient()

  return useQuery({
    queryKey:        ['region-preview', recipeId, stepPath, selector],
    queryFn:         () => client.regionPreview(recipeId as string, stepPath as string, selector as string),
    enabled:         recipeId !== undefined && stepPath !== undefined && selector !== undefined,
    placeholderData: previous => previous,
  })
}
