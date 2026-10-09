import { createContext, useContext } from 'react'

/**
 * The names of the hooks Studio was started with (`opencraw studio --hooks <file>`, issue #150), or
 * `undefined` when it was started without any. The editors read it to suggest a name where a recipe
 * calls a hook (issue #202); the app shell provides it from the open workspace.
 */
export const HookNamesContext = createContext<readonly string[] | undefined>(undefined)

/** What a new hook step or transform is called when Studio has no hooks loaded to offer one: a hook needs a name for the recipe to be valid at all, and the person renames it. */
export const DEFAULT_HOOK_NAME = 'myHook'

/** @returns The loaded hook names, `undefined` when Studio has no hooks. */
export function useHookNames (): readonly string[] | undefined {
  return useContext(HookNamesContext)
}
