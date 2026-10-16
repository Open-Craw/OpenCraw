import type { RecipeGroup, RecipeHeader } from './recipe-header.contract'

/**
 * What one row of the recipes view stands for, and what the commands on it (Run, Open in Studio) are handed: an output recipe with its inputs, or one
 * input recipe with the group it belongs to.
 */
export type RecipeNode =
  | { type: 'group', group: RecipeGroup } |
  { type: 'input', header: RecipeHeader, group: RecipeGroup }
