import { useCallback, useEffect, useState } from 'react'
import { useStudioClient } from '../studio-client'
import { useStudioUiStore } from '../studio-store'
import { useStartRecipeFromDocument } from './start-recipe.hook'

/** The last segment of a path, either separator: the document's file name. */
function fileNameOf (path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
}

/**
 * Opens what a path names, the way a link does (issue #235) and the way a controller's request does: the server says
 * whether it is a folder, a recipe file or a document; a folder opens as the workspace, a recipe is selected, a
 * document starts a recipe the way a dropped file does.
 *
 * @returns A function that opens `target` (with `workspace` as the folder a document belongs to) and throws when the path cannot be opened.
 */
export function useOpenTarget (): (target: string, workspace?: string) => Promise<void> {
  const client = useStudioClient()
  const commitFolder = useStudioUiStore(state => state.commitFolder)
  const selectRecipe = useStudioUiStore(state => state.selectRecipe)
  const startRecipe = useStartRecipeFromDocument()

  return useCallback(async (target, workspace) => {
    const view = await client.openPath(target, workspace)
    if (view.kind === 'document') {
      await startRecipe(view.folder, fileNameOf(view.path), view.url)
    } else {
      commitFolder(view.folder)
      if (view.kind === 'recipe' && view.recipeId !== undefined) selectRecipe(view.recipeId)
    }
  }, [client, commitFolder, selectRecipe, startRecipe])
}

/**
 * Opens what the link names (issue #235): `?open=<path>` is a folder, a recipe
 * file or a document, and `?folder=` the workspace it belongs to. The server
 * says which it is (`open-path`); a folder opens as the workspace, a recipe
 * is selected, a document starts a recipe the way a dropped file does.
 * Runs once on load, then drops `open` from the address so a reload does not
 * start a second recipe from the same file.
 *
 * @returns The error to show when the path could not be opened.
 */
export function useOpenPathFromLink (): string | undefined {
  const client = useStudioClient()
  const openTarget = useOpenTarget()
  const [error, setError] = useState<string>()

  useEffect(() => {
    const target = client.initialOpen
    if (target === undefined) return
    const forget = (): void => {
      const params = new URLSearchParams(globalThis.location.search)
      params.delete('open')
      globalThis.history.replaceState({}, '', `${globalThis.location.pathname}?${params.toString()}`)
    }
    void (async () => {
      try {
        await openTarget(target, client.initialFolder)
      } catch (openError) {
        setError(openError instanceof Error ? openError.message : String(openError))
      } finally {
        forget()
      }
    })()
    // Only on mount: the link is read once.
  }, [])

  return error
}
