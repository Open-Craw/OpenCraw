import type { BrowserClient, StorageState } from '../browser-session'
import { EventBus } from '../crawl-events'
import { HookRegistry } from '../hooks'
import type { InputRecipe } from '../recipe-schema'
import { resolveStorageState } from './bootstrap-session.use-case'

export interface SessionStateOptions {
  /** Launches (or returns) the browser; only called when the recipe needs one for its login. */
  browser:          () => Promise<BrowserClient>
  /** Where a relative `session.storageStatePath` or `bootstrap.saveTo` resolves from. Default: the working directory. */
  storageStateDir?: string
}

/**
 * The cookies and storage a recipe's own login leaves behind (a saved
 * `session.storageStatePath`, else its `session.bootstrap` steps run in a
 * browser), for a tool that has to see the pages as the crawl will. The
 * recipe's `steps` are not run, and no hooks are loaded, so a bootstrap that
 * uses a hook fails with `UnknownHookError`.
 *
 * @param recipe - The input recipe.
 * @param options - How to get a browser, and where saved state lives.
 * @returns The state, or `undefined` when the recipe declares no login.
 */
export async function sessionStateOf (recipe: InputRecipe, options: SessionStateOptions): Promise<StorageState | undefined> {
  return resolveStorageState(recipe, { browser: options.browser, hooks: new HookRegistry(), events: new EventBus(), storageStateDir: options.storageStateDir })
}
