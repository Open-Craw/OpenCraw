/** What "Load" brings in: a page address, or a document already copied into the workspace and named by its `file:` URL. */
export type LoadSource = { kind: 'url', url: string } | { kind: 'document', url: string }

/** What loading does to the recipe that is open. */
export type LoadPlan =
  /** `replace`: the recipe reads this kind of source, only its start address changes (`previous` is what it read before). */
  { kind: 'replace', recipe: Record<string, unknown>, previous?: string } |
  /** `new`: the recipe reads another kind of source, or none is open: the load starts a recipe of its own, and the open one is left untouched. */
  { kind: 'new' }

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether the recipe is a document recipe as `documentRecipeFiles` writes it: an `api` recipe whose first step requests the start address. */
function readsDocument (recipe: Record<string, unknown>): boolean {
  const first = Array.isArray(recipe.steps) ? recipe.steps[0] : undefined

  return recipe.mode === 'api' && isRecord(first) && first.type === 'request' && first.url === '{{start.url}}'
}

/**
 * Decides what "Load" does when a recipe is open: the document or page is the
 * sample the recipe is built against, so a source of the kind the recipe
 * already reads replaces its start address and nothing else (steps and mapping
 * stay). A source of the other kind would need different steps, which is a
 * different recipe, so it starts a new one instead of rewriting this one.
 *
 * @param recipe - The open input recipe's parsed JSON; `undefined` when none is open or it does not parse.
 * @param source - What is being loaded.
 */
export function planLoad (recipe: unknown, source: LoadSource): LoadPlan {
  if (!isRecord(recipe) || recipe.kind !== 'input' || !Array.isArray(recipe.start)) return { kind: 'new' }
  const [first, ...rest] = recipe.start as unknown[]
  if (!isRecord(first)) return { kind: 'new' }
  const readsThisKind = source.kind === 'document' ? readsDocument(recipe) : recipe.mode === 'web'
  if (!readsThisKind) return { kind: 'new' }
  const previous = typeof first.url === 'string' ? first.url : undefined

  return { kind: 'replace', recipe: { ...recipe, start: [{ ...first, url: source.url }, ...rest] }, previous }
}
