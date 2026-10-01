import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import type { ImportDocumentView } from '@opencraw/studio'
import { useStudioClient } from './use-studio-client.hook'

export interface ImportDocumentInput {
  folder: string
  /** The file's own name, as the browser reports it (`File.name`). */
  name:   string
  /** The file's content, base64-encoded (see `app/import-document.hook.ts` for the reading). */
  bytes:  string
}

/**
 * Copies a dropped or opened file into a workspace folder (`import-document`,
 * issue #120). Does not invalidate the workspace query itself: the copy is a
 * document, not a recipe; the flow that calls this saves the recipe pair
 * next, and `useSaveRecipeMutation` invalidates then.
 *
 * @returns The mutation; `.mutateAsync({ folder, name, bytes })` resolves to where the copy landed and its `file:` URL.
 */
export function useImportDocumentMutation (): UseMutationResult<ImportDocumentView, Error, ImportDocumentInput> {
  const client = useStudioClient()

  return useMutation({
    mutationFn: ({ folder, name, bytes }: ImportDocumentInput) => client.importDocument(folder, name, bytes),
  })
}
