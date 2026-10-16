import type { RecipeHeader } from './recipe-header.contract'

/**
 * Reads who a recipe file is from its text, looking only at `kind`, `id` and (for an input) `output`: the extension lists recipes without carrying the
 * engine, so a file is not validated here, only recognised. A file that is not JSON, or is JSON of another kind (a package.json, a tsconfig), is not a recipe.
 *
 * @param file - The file's path.
 * @param text - The file's content.
 * @returns The header, or `undefined` when the file is not a recipe.
 */
export function readRecipeHeader (file: string, text: string): RecipeHeader | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const { kind, id, output } = value as Record<string, unknown>
  if (typeof id !== 'string' || id === '' || (kind !== 'input' && kind !== 'output')) return undefined
  if (kind === 'output') return { file, kind, id }

  return { file, kind, id, ...(typeof output === 'string' && output !== '' && { output }) }
}
