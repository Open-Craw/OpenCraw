import type { InputRecipe, VarValue } from '../recipe-schema'

/** One run of a recipe: the recipe with its vars set, and the vars its matrix set, when it has one. */
export interface RecipeRun {
  input:    InputRecipe
  variant?: Record<string, VarValue>
}

/**
 * The runs a recipe makes: one, or one per combination of its `matrix`. An
 * object of lists gives every combination, the first var varying slowest (as
 * nested loops written in that order); a list of var sets gives those, in
 * order. Each run's vars are the recipe's, overridden by its combination.
 *
 * @param input - The input recipe.
 * @returns The runs, in order.
 */
export function recipeRuns (input: InputRecipe): RecipeRun[] {
  const matrix = input.matrix
  if (matrix === undefined) return [{ input }]
  const combinations = Array.isArray(matrix) ? matrix : product(Object.entries(matrix))

  return combinations.map(variant => ({ input: { ...input, vars: { ...input.vars, ...variant } }, variant }))
}

function product (lists: [string, VarValue[]][]): Record<string, VarValue>[] {
  return lists.reduce<Record<string, VarValue>[]>((combinations, [name, values]) => combinations.flatMap(combination => values.map(value => ({ ...combination, [name]: value }))), [{}])
}

/**
 * A variant as a short label: `state=Delhi, group=Bus`.
 *
 * @param variant - The vars a matrix set.
 * @returns The label.
 */
export function variantLabel (variant: Record<string, VarValue>): string {
  return Object.entries(variant).map(([name, value]) => `${name}=${String(value)}`).join(', ')
}
