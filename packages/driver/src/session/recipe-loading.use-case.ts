import { loadForRun } from '@opencraw/cli'
import { hookUses, RecipeBindingError, RecipeValidationError } from '@opencraw/core'
import type { RecipeSet, RecipeSource } from '@opencraw/core'
import type { ValidateParams, ValidateResult } from '../protocol'

/** The recipes a method names: files and folders, or the recipes themselves. Exactly one of the two. */
export function sourceOf (params: { paths?: string[], recipes?: Record<string, unknown>[] }): RecipeSource {
  if ((params.paths === undefined) === (params.recipes === undefined)) throw new Error('give exactly one of "paths" or "recipes"')

  return params.paths ?? params.recipes ?? []
}

/** Loads and binds a method's recipes, keeping the input ids in `only`. */
export async function loadRecipes (params: { paths?: string[], recipes?: Record<string, unknown>[], only?: string[] }): Promise<RecipeSet> {
  return await loadForRun(sourceOf(params), params.only ?? [])
}

/** Every hook the set's input recipes call, once each, sorted. */
export function hooksOf (set: RecipeSet): string[] {
  return [...new Set(set.inputs.flatMap(input => hookUses(input).map(use => use.name)))].sort((x, y) => x.localeCompare(y))
}

/**
 * Checks recipes the way `run` would load them, without running them.
 *
 * @param params - The recipes and the input ids to keep.
 * @returns Whether they load, the inputs and hooks a run would have, and every problem with its path.
 */
export async function validateRecipes (params: ValidateParams): Promise<ValidateResult> {
  try {
    const set = await loadRecipes(params)

    return { ok: true, inputs: set.inputs.map(input => input.id), hooks: hooksOf(set), issues: [] }
  } catch (error) {
    if (error instanceof RecipeValidationError) return { ok: false, inputs: [], hooks: [], issues: error.issues.map(issue => ({ source: error.source, path: issue.path, message: issue.message })) }
    if (error instanceof RecipeBindingError) return { ok: false, inputs: [], hooks: [], issues: error.issues.map(issue => ({ recipeId: issue.recipeId, path: issue.path, message: issue.message })) }

    return { ok: false, inputs: [], hooks: [], issues: [{ path: '', message: error instanceof Error ? error.message : String(error) }] }
  }
}
