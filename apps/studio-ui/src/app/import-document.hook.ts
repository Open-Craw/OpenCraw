import { useState } from 'react'
import { useImportDocumentMutation, useSaveRecipeMutation, useStudioClient } from '../studio-client'
import { useStudioUiStore } from '../studio-store'
import { documentRecipeFiles, recipeIdFromFileName, uniqueRecipeId } from './new-recipe.mapper'

export interface ImportDocumentFlow {
  /** Starts a recipe from one dropped/opened file; resolves once it is saved and selected, or once `error` is set. */
  importFile: (file: File) => Promise<void>
  pending:    boolean
  error?:     string
}

/**
 * Drop a file, get a recipe (issue #120): the whole flow behind the drop zone
 * and the toolbar's "Open document…" button. The file is copied into the
 * workspace folder (`import-document`, which also creates the folder), the
 * folder is listed to find a free recipe id, an `api` recipe pair reading
 * the copy by its `file:` URL is saved (the same `save-recipe` the JSON tab
 * uses), and the workspace is opened on that folder with the new recipe
 * selected — so the content pane shows the document's own canvas right away.
 *
 * The target folder is the one already open, else whatever the toolbar's
 * folder box says: a file dropped before any workspace is open starts one
 * there. With neither, the drop is refused with a message rather than
 * guessing a location on the person's disk.
 */
export function useImportDocumentFlow (): ImportDocumentFlow {
  const client = useStudioClient()
  const importDocument = useImportDocumentMutation()
  const saveRecipe = useSaveRecipeMutation()
  const folder = useStudioUiStore(state => state.folder)
  const openFolder = useStudioUiStore(state => state.openFolder)
  const commitFolder = useStudioUiStore(state => state.commitFolder)
  const selectRecipe = useStudioUiStore(state => state.selectRecipe)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function importFile (file: File): Promise<void> {
    const target = (openFolder ?? folder).trim()
    if (target === '') {
      setError('Type a workspace folder in the toolbar first, then drop the file again: that is where the copy and the recipe go.')

      return
    }
    setError(undefined)
    setPending(true)
    try {
      const { url } = await importDocument.mutateAsync({ folder: target, name: file.name, bytes: await fileToBase64(file) })
      const listing = await client.openWorkspace(target)
      const taken = listing.recipes.map(recipe => recipe.id).filter((id): id is string => id !== undefined)
      const id = uniqueRecipeId(recipeIdFromFileName(file.name), taken)
      const files = documentRecipeFiles(target, id, url)
      await saveRecipe.mutateAsync({ path: files.outputPath, recipe: files.output })
      await saveRecipe.mutateAsync({ path: files.inputPath, recipe: files.input })
      if (openFolder !== target) commitFolder(target)
      selectRecipe(id)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError))
    } finally {
      setPending(false)
    }
  }

  return { importFile, pending, error }
}

/** The file's content as base64, via the browser's own data-URL reading: no `btoa` over a megabytes-long string of char codes. */
function fileToBase64 (file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('error', () => { reject(reader.error ?? new Error(`could not read ${file.name}`)) })
    reader.addEventListener('load', () => {
      const dataUrl = String(reader.result)
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
    })
    reader.readAsDataURL(file)
  })
}
