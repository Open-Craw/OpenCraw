import { isBracket } from './outline.model'
import type { OutlineNode, RecipeOutline } from './outline.model'

/**
 * Rebuilds a recipe from its outline: `recipe`'s keys, in their original
 * order, with `steps` (when the recipe had one) replaced by the outline's
 * (possibly edited) step tree. A card's own raw `step` is used as-is; a
 * bracket's `step` supplies every field but `steps`/`else`, which come from
 * `children`/`elseChildren` instead, put back at the position `step` itself
 * held that key at (or appended, for a bracket a `+` menu just added, whose
 * `step` never had one) — this, together with `recipe-to-outline.mapper.ts`
 * always keeping the step's whole original object, is what makes
 * `recipe → outline → recipe` preserve every key and its order.
 *
 * @param outline - An outline, from `recipe-to-outline.mapper.ts` or edited by the UI.
 * @returns The recipe's plain JSON, ready for `save-recipe`.
 */
export function outlineToRecipe (outline: RecipeOutline): Record<string, unknown> {
  if (!('steps' in outline.recipe) && outline.steps.length === 0) return { ...outline.recipe }

  return { ...outline.recipe, steps: nodesToSteps(outline.steps) }
}

function nodesToSteps (nodes: readonly OutlineNode[]): unknown[] {
  return nodes.map(node => nodeToStep(node))
}

function nodeToStep (node: OutlineNode): unknown {
  if (!isBracket(node)) return node.step

  const keys = Object.keys(node.step)
  const step: Record<string, unknown> = {}
  for (const key of keys) {
    if (key === 'steps') step.steps = nodesToSteps(node.children)
    else if (key === 'else' && node.stepType === 'if') step.else = nodesToSteps(node.elseChildren ?? [])
    else step[key] = node.step[key]
  }
  if (!keys.includes('steps')) step.steps = nodesToSteps(node.children)
  if (node.stepType === 'if' && node.elseChildren !== undefined && !keys.includes('else')) step.else = nodesToSteps(node.elseChildren)

  return step
}
