import { useState } from 'react'
import { useSaveRecipeMutation, useStudioClient } from '../studio-client'
import { useStudioUiStore } from '../studio-store'
import { useLoadSource } from './load-source.hook'
import { jsonUrlRecipeFiles, newRecipeFiles, recipeIdFromFileName, uniqueRecipeId } from './new-recipe.mapper'

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
 * is the open one, else the toolbar's folder box, as for a dropped file. An address that returns JSON starts an `api` recipe that reads it
 * as JSON (with the JSON tree to pick from), named after the last part of its path, not a browser recipe over the text of the response.
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
    const { json } = await client.detectUrl(url)
    const address = new URL(url)
    const segments = address.pathname.split('/').filter(segment => segment !== '')
    // eslint-disable-next-line unicorn/prefer-at -- apps/studio-ui's tsconfig lib is ["dom"] only (no ES2022 Array#at)
    const lastSegment = segments[segments.length - 1] as string | undefined
    const id = uniqueRecipeId(recipeIdFromFileName(json && lastSegment !== undefined ? lastSegment : address.hostname), taken)
    const files = json ? jsonUrlRecipeFiles(target, id, url) : newRecipeFiles(target, id, url)
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
