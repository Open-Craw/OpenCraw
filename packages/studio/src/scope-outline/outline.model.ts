/**
 * The outline model: an `InputRecipe`'s `steps` (and only `steps`; the rest
 * of the recipe passes through untouched, see `recipe-to-outline.mapper.ts`)
 * read as a tree of cards and brackets instead of raw JSON.
 *
 * A **card** is one step that reads as a sentence (`sentence`, built by
 * `card-sentence.mapper.ts`). A **bracket** is a container step (`forEach`,
 * `paginate`, `if`) whose body is itself a list of cards/brackets: the
 * indentation the plan doc describes is this nesting, not a separate layout
 * concept. Both kinds carry `step`, the step's own raw JSON exactly as
 * parsed (every key, in its original order): `outline-to-recipe.mapper.ts`
 * rebuilds the recipe from it, substituting only the (possibly edited)
 * `children`/`elseChildren` for whatever `steps`/`else` value `step` itself
 * holds, so an edit to one field never disturbs another's position or a
 * step type this outline cannot make sense of.
 */

/** One piece of a card's sentence: plain wording, a bound id (a "pill"), or a literal (a selector, a template, a value) shown as code. */
export interface SentencePart {
  kind: 'word' | 'pill' | 'code'
  text: string
}

/** The step types the outline renders as a bracket: their body is nested steps, not a single value. */
export const BRACKET_STEP_TYPES = ['forEach', 'paginate', 'if'] as const
export type BracketStepType = typeof BRACKET_STEP_TYPES[number]

interface OutlineNodeBase {
  /** The step's JSON path in the recipe, e.g. `steps.3.steps.1`. */
  path:     string
  /** The step's own `type`, or `'unknown'` when `step` has none. */
  stepType: string
  sentence: SentencePart[]
  /** The step's raw JSON, exactly as parsed: never dropped, always editable as JSON. */
  step:     Record<string, unknown>
}

/** One step the outline could not, or chose not to, read as a bracket: a leaf card. */
export interface OutlineCard extends OutlineNodeBase {
  kind:   'card'
  /** `true` when `card-sentence.mapper.ts` could not build a real sentence: the UI shows `step` as raw, editable JSON instead. */
  custom: boolean
}

/** A container step (`forEach`, `paginate`, `if`): its body nested one level in. */
export interface OutlineBracket extends OutlineNodeBase {
  kind:          'bracket'
  stepType:      BracketStepType
  children:      OutlineNode[]
  /** `if` only: the `else` branch, when the step has one. */
  elseChildren?: OutlineNode[]
}

export type OutlineNode = OutlineCard | OutlineBracket

/** A recipe read as an outline: `recipe` is everything but the derived view of `steps`, kept so the mapper back can restore it untouched. */
export interface RecipeOutline {
  recipe: Record<string, unknown>
  steps:  OutlineNode[]
}

export function isBracket (node: OutlineNode): node is OutlineBracket {
  return node.kind === 'bracket'
}

export function isBracketStepType (type: string): type is BracketStepType {
  return (BRACKET_STEP_TYPES as readonly string[]).includes(type)
}
