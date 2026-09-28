import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import type { DocumentTreeView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

/**
 * The content pane's tree canvas data for a JSON/YAML/XML snapshot
 * (`document-tree`, studio plan §3.4, issue #94's 5a), off the same cached
 * snapshot `useSnapshotQuery` reads — pass `enabled: false` until that query
 * has actually succeeded with a `format` the tree canvas handles
 * (`document-tree` throws server-side otherwise).
 *
 * @param recipeId - The recipe to read; `undefined` disables the query.
 * @param stepPath - The step to read after; `undefined` disables the query.
 * @param enabled - An extra gate (default `true`), for "only once the snapshot query has resolved with a json/xml format".
 * @returns The query result; `data` is the tree.
 */
export function useDocumentTreeQuery (recipeId: string | undefined, stepPath: string | undefined, enabled = true): UseQueryResult<DocumentTreeView, Error> {
  const client = useStudioClient()

  return useQuery({
    queryKey: ['document-tree', recipeId, stepPath],
    queryFn:  () => client.documentTree(recipeId as string, stepPath as string),
    enabled:  enabled && recipeId !== undefined && stepPath !== undefined,
  })
}
