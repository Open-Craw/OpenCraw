import { useState } from 'react'
import { useImportDocumentMutation } from '../studio-client'
import { useStudioUiStore } from '../studio-store'
import { useLoadSource } from './load-source.hook'
import { useStartRecipeFromDocument } from './start-recipe.hook'

export interface ImportDocumentFlow {
  /** Starts a recipe from one dropped/opened file; resolves once it is saved and selected, or once `error` is set. */
  importFile: (file: File) => Promise<void>
  pending:    boolean
  error?:     string
  /** What loading did to the recipe that was open, when it is worth saying (replaced its source, or left it alone and started another). */
  notice?:    string
}

/**
 * Drop a file, load it (issue #120): the whole flow behind the drop zone
 * and the toolbar's "Load ▾ Document…" item. The file is copied into the
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
  const importDocument = useImportDocumentMutation()
  const startRecipe = useStartRecipeFromDocument()
  const loadSource = useLoadSource()
  const folder = useStudioUiStore(state => state.folder)
  const openFolder = useStudioUiStore(state => state.openFolder)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string>()

  async function importFile (file: File): Promise<void> {
    const target = (openFolder ?? folder).trim()
    if (target === '') {
      setError('Type a workspace folder in the toolbar first, then drop the file again: that is where the copy and the recipe go.')

      return
    }
    setError(undefined)
    setNotice(undefined)
    setPending(true)
    try {
      const { url } = await importDocument.mutateAsync({ folder: target, name: file.name, bytes: await fileToBase64(file) })
      setNotice(await loadSource({ kind: 'document', url }, file.name, async () => { await startRecipe(target, file.name, url) }))
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError))
    } finally {
      setPending(false)
    }
  }

  return { importFile, pending, error, notice }
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
