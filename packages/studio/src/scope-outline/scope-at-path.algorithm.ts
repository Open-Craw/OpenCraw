import { bindingsAt } from '@opencraw/core'
import type { InputRecipe } from '@opencraw/core'

const BUILT_INS = ['page', 'start', 'vars']

/**
 * The ids visible at a step path: the built-ins (`page`, `start`, `vars`),
 * every id bound above it on the same path, and the `as`/`next.as` name of
 * every loop it sits inside. This is core's own binding rule
 * (`bindingsAt`, `recipe-loading/recipe-binding.validator.ts`): the walk
 * that decides what a `{{ }}` template, `from` or `over` can name is the one
 * `opencraw validate` already runs, not a copy of it.
 *
 * `content` is the recipe's raw parsed JSON, the same loosely-typed value
 * `recipe-to-outline.mapper.ts` reads: a recipe mid-edit may not parse as a
 * valid `InputRecipe` (a missing `mode`, a step with the wrong shape), and
 * this never throws for that — it falls back to just the built-ins.
 *
 * @param content - The recipe's parsed JSON.
 * @param path - A step's JSON path, e.g. `steps.3.steps.1`.
 * @returns The ids in scope at that path, `page`/`start`/`vars` first.
 */
export function scopeAtPath (content: unknown, path: string): string[] {
  if (!looksLikeInputRecipe(content)) return [...BUILT_INS]

  try {
    return bindingsAt(content, path)
  } catch {
    return [...BUILT_INS]
  }
}

/**
 * Enough of `InputRecipe`'s shape for `bindingsAt` to walk safely: an array
 * of steps, and container fields it only ever reads, never assumes present.
 * Not a schema check — `parseInputRecipe` already owns that — just what
 * keeps `bindingsAt` from throwing on a value that is not really a recipe.
 */
function looksLikeInputRecipe (content: unknown): content is InputRecipe {
  return typeof content === 'object' && content !== null && Array.isArray((content as { steps?: unknown }).steps)
}
