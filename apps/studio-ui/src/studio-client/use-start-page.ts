import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { useStudioClient } from './use-studio-client'

/**
 * Fetches the selected recipe's start page as the engine would see it
 * (`fetch-start-page`): a genuine second round trip, not a selector over the
 * workspace query — `open-workspace` never fetches a live page, only reads
 * files (checked against `studio-server/fetch-start-page.handler.ts`, which
 * loads the recipe pair and calls `page-snapshot`'s `fetchStartPage` itself).
 *
 * @param recipeId - The recipe to fetch the start page of; `undefined` disables the query.
 * @returns The query result; `data` is the page's HTML (or JSON as text, for an api recipe).
 */
export function useStartPageQuery (recipeId: string | undefined): UseQueryResult<string, Error> {
  const client = useStudioClient()

  return useQuery({
    queryKey: ['start-page', recipeId],
    queryFn:  () => client.fetchStartPage(recipeId as string),
    enabled:  recipeId !== undefined,
  })
}
