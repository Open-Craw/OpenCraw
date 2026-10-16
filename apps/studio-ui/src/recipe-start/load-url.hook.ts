import { useState } from 'react'
import { useSaveRecipeMutation, useStudioClient } from '../studio-client'
import { useStudioUiStore } from '../studio-store'
import { useLoadSource } from './load-source.hook'
import { documentUrlRecipeFiles, newRecipeFiles, recipeIdFromAddress, uniqueRecipeId } from './new-recipe.mapper'

export interface LoadUrlFlow {
  /** Loads a page address; resolves once the recipe is saved and selected, or once `error` is set. */
  loadUrl: (url: string) => Promise<void>
  pending: boolean
  error?:  string
  /** What loading did to the recipe that was open, when it is worth saying. */
  notice?: string
}

/**
 * "Load ▾ URL…": a web recipe's start address is the page it is built
 * against, so with a web recipe open the address replaces its start URL and
 * the steps and mapping stay. With no recipe open (or a document recipe) a new
 * `web` recipe pair named after the host is written and selected. The folder
 * is the open one, else the toolbar's folder box, as for a dropped file. An address that returns a document (JSON, a PDF, a CSV, a
 * spreadsheet, Markdown...) starts an `api` recipe that reads it as that kind, with the document's own view to pick from, not a browser
 * recipe over a response that is not a page. The recipe is named after the site and the end of the address.
 */
export function useLoadUrlFlow (): LoadUrlFlow {
  const client = useStudioClient()
  const saveRecipe = useSaveRecipeMutation()
  const loadSource = useLoadSource()
  const folder = useStudioUiStore(state => state.folder)
  const openFolder = useStudioUiStore(state => state.openFolder)
  const commitFolder = useStudioUiStore(state => state.commitFolder)
  const selectRecipe = useStudioUiStore(state => state.selectRecipe)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  async function startNew (target: string, url: string): Promise<void> {
    const listing = await client.openWorkspace(target)
    const taken = listing.recipes.map(recipe => recipe.id).filter((id): id is string => id !== undefined)
    const { kind } = await client.detectUrl(url)
    const id = uniqueRecipeId(recipeIdFromAddress(url), taken)
    const files = kind === 'html' || kind === 'unknown' ? newRecipeFiles(target, id, url) : documentUrlRecipeFiles(target, id, url, kind)
    await saveRecipe.mutateAsync({ path: files.outputPath, recipe: files.output })
    await saveRecipe.mutateAsync({ path: files.inputPath, recipe: files.input })
    if (useStudioUiStore.getState().openFolder !== target) commitFolder(target)
    selectRecipe(id)
  }

  async function loadUrl (url: string): Promise<void> {
    const target = (openFolder ?? folder).trim()
    if (target === '') {
      setError('Open a workspace folder first (Recipe ▾ → Open folder…): that is where the recipe is written.')

      return
    }
    setError(undefined)
    setNotice(undefined)
    setPending(true)
    try {
      const address = url.trim()
      setNotice(await loadSource({ kind: 'url', url: address }, address, async () => { await startNew(target, address) }))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setPending(false)
    }
  }

  return { loadUrl, pending, error, notice }
}
