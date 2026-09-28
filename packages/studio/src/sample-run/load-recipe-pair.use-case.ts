import { parseInputRecipe, parseOutputRecipe, readRecipeSource } from '@opencraw/core'
import type { InputRecipe, OutputRecipe } from '@opencraw/core'

/** An input recipe and the output recipe it names, both parsed. */
export interface RecipePair {
  input:  InputRecipe
  output: OutputRecipe
}

/**
 * Finds and parses one input recipe of a workspace folder, and the output
 * recipe it names.
 *
 * @param folder - The workspace folder.
 * @param recipeId - The input recipe's id.
 * @returns The parsed pair.
 * @throws RecipeValidationError when either recipe does not parse.
 * @throws Error when the input or its output is not in the folder.
 */
export async function loadRecipePair (folder: string, recipeId: string): Promise<RecipePair> {
  const documents = await readRecipeSource(folder)
  const inputDocument = documents.find(document => kindOf(document.content) === 'input' && idOf(document.content) === recipeId)
  if (inputDocument === undefined) throw new Error(`no input recipe "${recipeId}" in this workspace`)
  const input = parseInputRecipe(inputDocument.content, inputDocument.source)
  const outputDocument = documents.find(document => kindOf(document.content) === 'output' && idOf(document.content) === input.output)
  if (outputDocument === undefined) throw new Error(`no output recipe "${input.output}" in this workspace`)

  return { input, output: parseOutputRecipe(outputDocument.content, outputDocument.source) }
}

function kindOf (content: unknown): unknown {
  return (content as { kind?: unknown } | null)?.kind
}

function idOf (content: unknown): unknown {
  return (content as { id?: unknown } | null)?.id
}
