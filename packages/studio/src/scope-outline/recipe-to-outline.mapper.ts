import { cardSentence } from './card-sentence.mapper'
import { isBracketStepType } from './outline.model'
import type { OutlineNode, RecipeOutline } from './outline.model'

/**
 * Reads a recipe's `steps` as an outline. Works on whatever JSON parsed
 * (not a validated `InputRecipe`): a recipe mid-edit in the JSON tab may be
 * missing fields or have the wrong shape, and the outline still has to
 * render something rather than crash the tab. Anything that is not a
 * well-formed step becomes a custom card holding what was there; anything
 * that is not an object at the top becomes an outline with no steps.
 *
 * @param content - The recipe's parsed JSON (the JSON tab's own `JSON.parse` of its text).
 * @returns The outline: the untouched top-level record plus the step tree.
 */
export function recipeToOutline (content: unknown): RecipeOutline {
  const recipe = isRecord(content) ? content : {}
  const steps = Array.isArray(recipe.steps) ? recipe.steps : []

  return { recipe, steps: stepsToNodes(steps, 'steps') }
}

function stepsToNodes (steps: readonly unknown[], pathPrefix: string): OutlineNode[] {
  return steps.map((step, index) => stepToNode(step, `${pathPrefix}.${index}`))
}

function stepToNode (step: unknown, path: string): OutlineNode {
  if (!isRecord(step)) {
    return { kind: 'card', path, stepType: 'unknown', sentence: [{ kind: 'word', text: 'custom step' }], step: {}, custom: true }
  }

  const stepType = typeof step.type === 'string' ? step.type : 'unknown'
  const { parts, custom } = cardSentence(step)

  if (!isBracketStepType(stepType)) return { kind: 'card', path, stepType, sentence: parts, step, custom }

  const children = Array.isArray(step.steps) ? stepsToNodes(step.steps, `${path}.steps`) : []
  const elseChildren = stepType === 'if' && Array.isArray(step.else) ? stepsToNodes(step.else, `${path}.else`) : undefined

  return { kind: 'bracket', path, stepType, sentence: parts, step, children, ...(elseChildren !== undefined && { elseChildren }) }
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
