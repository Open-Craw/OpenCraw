import type { z } from 'zod'
import { inputRecipeSchema } from './input-recipe.contract'
import type { InputRecipe } from './input-recipe.contract'
import { outputRecipeSchema } from './output-recipe.contract'
import type { OutputRecipe } from './output-recipe.contract'
import { RecipeValidationError } from './recipe-validation.error'
import type { RecipeIssue } from './recipe-validation.error'

/**
 * Turns zod's issues into the flat, path-annotated list a recipe author can act on.
 *
 * @param issues - What zod reported.
 * @returns One entry per issue, deduplicated by path and message.
 */
function toRecipeIssues (issues: readonly z.core.$ZodIssue[]): RecipeIssue[] {
  const seen = new Set<string>()
  const result: RecipeIssue[] = []
  const flat = unwrapKeys(flattenUnions(issues))
  for (const issue of flat) {
    const path = pathText(issue.path)
    const key = `${path}|${issue.message}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ path, message: issue.message })
  }

  return result
}

/**
 * A plain union reports one issue at its root with every branch's issues
 * nested inside. The most specific branch (the one that got deepest before
 * failing) is the one the author meant, so its issues replace the root one.
 *
 * @param issues - Issues as zod reports them.
 * @returns Issues with union roots replaced by their best branch, recursively.
 */
function flattenUnions (issues: readonly z.core.$ZodIssue[]): z.core.$ZodIssue[] {
  return issues.flatMap((issue) => {
    if (issue.code !== 'invalid_union' || issue.errors.length === 0) return [issue]
    const branches = issue.errors.map(branch => flattenUnions(branch))
    const deepest = branches.reduce((best, branch) => (depthOf(branch) > depthOf(best) ? branch : best))

    return deepest.map(inner => ({ ...inner, path: [...issue.path, ...inner.path] }))
  })
}

/**
 * A record key that fails its own schema is reported as zod's generic
 * "Invalid key in record", with the key schema's message nested inside. The
 * nested issues say what is wrong with the key, so they replace it.
 *
 * @param issues - Issues as zod reports them, unions already flattened.
 * @returns Issues with key failures replaced by their own messages, at the key's path.
 */
function unwrapKeys (issues: readonly z.core.$ZodIssue[]): z.core.$ZodIssue[] {
  return issues.flatMap((issue) => {
    if (issue.code !== 'invalid_key' || issue.issues.length === 0) return [issue]

    return unwrapKeys(issue.issues).map(inner => ({ ...inner, path: [...issue.path, ...inner.path] }))
  })
}

/**
 * Writes a JSON path the way an author reads it: `steps.0.id`, and a key that
 * is not a plain word in brackets, `fields["stock.count"]`, so a dot inside a
 * key never reads as nesting.
 *
 * @param path - The path segments zod reported.
 * @returns The path as text, `''` for the root.
 */
function pathText (path: readonly PropertyKey[]): string {
  let text = ''
  for (const segment of path) {
    const name = String(segment)
    if (typeof segment === 'string' && !/^[\w$-]+$/.test(name)) text += `[${JSON.stringify(name)}]`
    else text += text === '' ? name : `.${name}`
  }

  return text
}

function depthOf (issues: readonly z.core.$ZodIssue[]): number {
  return Math.max(0, ...issues.map(issue => issue.path.length))
}

/**
 * Parses an unknown value (a decoded JSON file) as an output recipe.
 *
 * @param value - The decoded JSON.
 * @param source - A name for error messages, usually the file path.
 * @returns The typed recipe.
 * @throws RecipeValidationError when it does not match the contract.
 */
export function parseOutputRecipe (value: unknown, source = 'output recipe'): OutputRecipe {
  const result = outputRecipeSchema.safeParse(value)
  if (!result.success) throw new RecipeValidationError(source, toRecipeIssues(result.error.issues))

  return result.data
}

/**
 * Parses an unknown value (a decoded JSON file) as an input recipe.
 *
 * @param value - The decoded JSON.
 * @param source - A name for error messages, usually the file path.
 * @returns The typed recipe.
 * @throws RecipeValidationError when it does not match the contract.
 */
export function parseInputRecipe (value: unknown, source = 'input recipe'): InputRecipe {
  const result = inputRecipeSchema.safeParse(value)
  if (!result.success) throw new RecipeValidationError(source, toRecipeIssues(result.error.issues))

  return result.data
}

/**
 * Reads the `kind` of a decoded recipe without validating the rest.
 *
 * @param value - The decoded JSON.
 * @returns `'input'`, `'output'`, or `undefined` when it is neither.
 */
export function recipeKindOf (value: unknown): 'input' | 'output' | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const kind = (value as { kind?: unknown }).kind

  return kind === 'input' || kind === 'output' ? kind : undefined
}
