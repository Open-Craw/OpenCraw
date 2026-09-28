import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { DeckDocumentView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

/**
 * The content pane's deck canvas data for a `.pptx` snapshot (`deck-view`,
 * studio plan §3.4, issue #94's 5d), off the same cached snapshot
 * `useSnapshotQuery` reads — pass `enabled: false` until that query has
 * actually succeeded with `format: "pptx"` (`deck-view` throws server-side
 * otherwise).
 *
 * @param recipeId - The recipe to read; `undefined` disables the query.
 * @param stepPath - The step to read after; `undefined` disables the query.
 * @param enabled - An extra gate (default `true`), for "only once the snapshot query has resolved with a pptx format".
 * @returns The query result; `data` is every slide's shapes, tables, charts and notes.
 */
export function useDeckViewQuery (recipeId: string | undefined, stepPath: string | undefined, enabled = true): UseQueryResult<DeckDocumentView, Error> {
  const client = useStudioClient()

  return useQuery({
    queryKey: ['deck-view', recipeId, stepPath],
    queryFn:  () => client.deckView(recipeId as string, stepPath as string),
    enabled:  enabled && recipeId !== undefined && stepPath !== undefined,
  })
}
