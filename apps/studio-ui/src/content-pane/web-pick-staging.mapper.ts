import type { FieldPick, InferSelectorView, SelectorAlternative } from '@opencraw/studio'

/** What a click (or two) on a web page inferred, before anything is added to the recipe. */
export type WebPick = Extract<InferSelectorView, { kind: 'field' | 'item-field' | 'list' }>

/** A pick waiting for "Add to recipe", with the selectors the person has chosen for it (the suggested ones until they choose). */
export interface StagedWebPick {
  pick:          WebPick
  fieldSelector: string
  /** Only for a list: the selector of its items. */
  itemSelector?: string
  /** What the first clicked element reads, so the person sees what they picked. */
  text?:         string
  /** Collect every element the chosen selector matches, as an array, instead of the first (a single value only). */
  many?:         boolean
}

/**
 * Starts staging a pick with its suggested selectors chosen.
 *
 * @param pick - What `infer-selector` answered.
 * @param text - The clicked element's text, when known.
 * @returns The staged pick.
 */
export function stagePick (pick: WebPick, text?: string): StagedWebPick {
  return {
    pick,
    fieldSelector: pick.field.selector,
    ...(pick.kind === 'list' && { itemSelector: pick.item.selector }),
    ...(text !== undefined && { text }),
  }
}

/** The matches a selector has among a pick's alternatives; the suggested count when it is not one of them (a selector typed by hand is checked apart). */
function matchesOf (selector: string, options: readonly SelectorAlternative[] | undefined, fallback: number): number {
  return options?.find(option => option.selector === selector)?.matches ?? fallback
}

function chosenField (field: FieldPick, selector: string): FieldPick {
  return { ...field, selector, matches: matchesOf(selector, field.alternatives, field.matches) }
}

/**
 * The pick with the selectors the person chose in place of the suggested ones, ready to be written to the recipe.
 *
 * @param staged - The staged pick.
 * @returns The pick, its field (and a list's items) reading the chosen selectors.
 */
export function chosenPick (staged: StagedWebPick): WebPick {
  const { pick } = staged
  const field = chosenField(pick.field, staged.fieldSelector)
  if (pick.kind !== 'list') return { ...pick, field }
  const selector = staged.itemSelector ?? pick.item.selector

  return { ...pick, field, item: { ...pick.item, selector, matches: matchesOf(selector, pick.item.alternatives, pick.item.matches) } }
}

/**
 * How many elements the chosen selector matches, when a single value is being picked and more than one match makes collecting them all (an array) a choice.
 *
 * @param staged - The staged pick.
 * @returns The match count, or `undefined` when there is no such choice (a list, or one match).
 */
export function manyChoice (staged: StagedWebPick): number | undefined {
  if (staged.pick.kind === 'list') return undefined
  const matches = chosenField(staged.pick.field, staged.fieldSelector).matches

  return matches > 1 ? matches : undefined
}

/** Whether the pick, as chosen, collects every match as an array: only when asked for and the selector still matches more than one. */
export function collectsMany (staged: StagedWebPick): boolean {
  return staged.many === true && manyChoice(staged) !== undefined
}

/** The options of one group: the verified alternatives, or just the suggested selector when the server sent none. */
function optionsOf (alternatives: readonly SelectorAlternative[] | undefined, suggested: { selector: string, tier: SelectorAlternative['tier'], matches: number }): readonly SelectorAlternative[] {
  return alternatives !== undefined && alternatives.length > 0 ? alternatives : [{ selector: suggested.selector, tier: suggested.tier, matches: suggested.matches }]
}

export interface StagedGroup {
  title:        string
  options:      readonly SelectorAlternative[]
  selected:     string
  generatedId?: string
  /** Which selector of the staged pick the group chooses. */
  target:       'field' | 'item'
}

/**
 * The groups of choices to show for a staged pick: a list asks for its items and for the value read in each; a single value asks for one selector.
 *
 * @param staged - The staged pick.
 * @returns The groups, in the order shown.
 */
export function groupsOf (staged: StagedWebPick): StagedGroup[] {
  const { pick } = staged
  const field: StagedGroup = {
    title:    pick.kind === 'list' ? 'Value in each item' : 'How to find it',
    options:  optionsOf(pick.field.alternatives, pick.field),
    selected: staged.fieldSelector,
    target:   'field',
    ...(pick.field.generatedId !== undefined && { generatedId: pick.field.generatedId }),
  }
  if (pick.kind !== 'list') return [field]

  return [{ title: 'Each item of the list', options: optionsOf(pick.item.alternatives, pick.item), selected: staged.itemSelector ?? pick.item.selector, target: 'item' }, field]
}

/** The headline for a staged pick. */
export function headingFor (staged: StagedWebPick): string {
  if (staged.pick.kind === 'list') return `Collect this for every one of the ${String(staged.pick.item.matches)} items`
  if (staged.pick.kind === 'item-field') return 'Collect this from each item of the list'

  return 'Collect this value'
}

/** What else a person can do with a staged pick, in one line. */
export function hintFor (staged: StagedWebPick): string | undefined {
  if (staged.pick.kind === 'field') return 'Click a similar item as well to collect the whole list. Pick the way to find it that will keep working.'
  if (staged.pick.kind === 'list') return 'Pick the ways to find the items and the value that will keep working.'

  return undefined
}
