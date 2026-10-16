import * as vscode from 'vscode'
import { readRecipeHeader } from './read-recipe-header.algorithm'
import type { RecipeHeader } from './recipe-header.contract'

/** The file names recipes go by: the `ocw-in`/`ocw-out` the schemas are bound to, and the `input`/`output` the example recipes use. */
const RECIPE_FILES = '**/*.{ocw-in,ocw-out,input,output}.json'
const NOT_RECIPES = '**/{node_modules,dist,.git,out-tsc}/**'
/** A burst of saves (a branch switch, a formatter) is one refresh. */
const REFRESH_DELAY_MS = 300

/** The recipes of the workspace, kept current. */
export interface RecipeIndex {
  /** Every recipe file in the workspace folders, who each one is. */
  headers:     () => Promise<RecipeHeader[]>
  /** Fires when a recipe file was created, changed or deleted. */
  onDidChange: vscode.Event<void>
  dispose:     () => void
}

/**
 * Finds the recipe files in the workspace and watches them.
 *
 * @returns The index.
 */
export function createRecipeIndex (): RecipeIndex {
  const changed = new vscode.EventEmitter<void>()
  const watcher = vscode.workspace.createFileSystemWatcher(RECIPE_FILES)
  let timer: NodeJS.Timeout | undefined
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => { changed.fire() }, REFRESH_DELAY_MS)
  }
  const subscriptions = [watcher, watcher.onDidCreate(schedule), watcher.onDidChange(schedule), watcher.onDidDelete(schedule), vscode.workspace.onDidChangeWorkspaceFolders(schedule), changed]

  return {
    headers: async () => {
      const uris = await vscode.workspace.findFiles(RECIPE_FILES, NOT_RECIPES)
      const headers = await Promise.all(uris.map(async (uri) => {
        try {
          return readRecipeHeader(uri.fsPath, new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)))
        } catch {
          return
        }
      }))

      return headers.filter((header): header is RecipeHeader => header !== undefined)
    },
    onDidChange: changed.event,
    dispose:     () => {
      clearTimeout(timer)
      for (const subscription of subscriptions) subscription.dispose()
    },
  }
}
