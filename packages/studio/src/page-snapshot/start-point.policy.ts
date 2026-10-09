/** The keys of an input recipe that do not change what its start point shows: the steps and mapping run after it, `output` and `$schema` only name things. */
const AFTER_START = new Set(['steps', 'mapping', 'output', '$schema'])

/**
 * Whether an edit changes the page a recipe's start snapshot shows (issue
 * #159): its start URLs, mode, session, vars, headers… anything but the steps
 * and mapping that run after it. A pick only adds steps, so it keeps the
 * snapshot already taken instead of fetching the page again.
 *
 * @param before - The recipe as last saved (`undefined` when there was none).
 * @param after - The recipe being saved.
 * @returns `true` when the cached start snapshot may now be out of date.
 */
export function startPointChanged (before: unknown, after: unknown): boolean {
  return JSON.stringify(startPartOf(before)) !== JSON.stringify(startPartOf(after))
}

function startPartOf (recipe: unknown): unknown {
  if (typeof recipe !== 'object' || recipe === null) return recipe

  return Object.fromEntries(Object.entries(recipe).filter(([key]) => !AFTER_START.has(key)).sort(([a], [b]) => a.localeCompare(b)))
}
