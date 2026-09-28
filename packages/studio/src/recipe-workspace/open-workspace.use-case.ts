import { RecipeBindingError, RecipeValidationError, bindRecipeSet, parseInputRecipe, parseOutputRecipe, readRecipeSource } from '@opencraw/core'
import type { InputRecipe, OutputRecipe } from '@opencraw/core'
import type { RecipeIssue, WorkspaceView } from '../studio-api'

interface Entry {
  file:    string
  kind:    'input' | 'output' | 'unknown'
  id?:     string
  issues:  RecipeIssue[]
  recipe?: InputRecipe | OutputRecipe
  /** The decoded JSON, kept even when it fails to parse against its schema: the JSON tab's starting text. */
  content: unknown
}

/**
 * Opens a recipe folder: every `.json`/`.jsonl` recipe directly inside it
 * (core's own directory reading, so relative `file:` URLs resolve the same
 * way a real run would), parsed and, for each output recipe found, bound to
 * the input recipes that name it. Nothing throws for a bad recipe or a
 * recipe that does not bind: every problem is reported on its file with the
 * JSON path core already computes, exactly as `opencraw validate` prints it.
 *
 * @param folder - The workspace folder.
 * @returns Every recipe file found, each with its validation and binding issues.
 * @throws Error when the folder does not exist or cannot be read.
 */
export async function openWorkspace (folder: string): Promise<WorkspaceView> {
  const documents = await readRecipeSource(folder)
  const entries = documents.map(document => parseDocument(document))
  const outputs = entries.filter(isParsed<OutputRecipe>('output'))
  const inputs = entries.filter(isParsed<InputRecipe>('input'))
  for (const output of outputs) bindOutput(output, inputs)
  for (const input of inputs) {
    if (outputs.every(output => output.recipe.id !== input.recipe.output)) {
      input.issues.push({ path: 'output', message: `no output recipe "${input.recipe.output}" in this workspace`, kind: 'binding' })
    }
  }

  return { folder, recipes: entries.map(({ file, kind, id, issues, content }) => ({ file, kind, id, issues, text: `${JSON.stringify(content, null, 2)}\n` })) }
}

/** Binds one output recipe to the inputs that name it, filing every binding issue back on the recipe it names. */
function bindOutput (output: Entry & { recipe: OutputRecipe }, inputs: (Entry & { recipe: InputRecipe })[]): void {
  const matching = inputs.filter(input => input.recipe.output === output.recipe.id)
  try {
    bindRecipeSet(output.recipe, matching.map(input => input.recipe))
  } catch (error) {
    if (!(error instanceof RecipeBindingError)) throw error
    for (const issue of error.issues) {
      const target = issue.recipeId === output.recipe.id ? output : matching.find(input => input.recipe.id === issue.recipeId)
      target?.issues.push({ path: issue.path, message: issue.message, kind: 'binding' })
    }
  }
}

function isParsed<T> (kind: 'input' | 'output') {
  return (entry: Entry): entry is Entry & { recipe: T } => entry.kind === kind && entry.recipe !== undefined
}

function parseDocument (document: { source: string, content: unknown }): Entry {
  const kind = (document.content as { kind?: unknown } | null)?.kind
  if (kind === 'output') return parseOne(document.source, document.content, 'output', parseOutputRecipe)
  if (kind === 'input') return parseOne(document.source, document.content, 'input', parseInputRecipe)

  return { file: document.source, kind: 'unknown', content: document.content, issues: [{ path: 'kind', message: '"kind" is missing or not "input"/"output"', kind: 'validation' }] }
}

function parseOne (file: string, content: unknown, kind: 'input' | 'output', parse: (value: unknown, source: string) => InputRecipe | OutputRecipe): Entry {
  try {
    const recipe = parse(content, file)

    return { file, kind, content, id: recipe.id, issues: [], recipe }
  } catch (error) {
    if (!(error instanceof RecipeValidationError)) throw error

    return { file, kind, content, issues: error.issues.map(issue => ({ path: issue.path === '' ? '(root)' : issue.path, message: issue.message, kind: 'validation' })) }
  }
}
