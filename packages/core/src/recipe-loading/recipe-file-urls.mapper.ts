import { resolveFileUrl } from '../http-session'

/**
 * Resolves the relative `file:` URLs an input recipe read from a file names
 * (`file:data/listino.csv`, `file:./x.pdf`) against the folder of that file,
 * so a recipe and its documents move together. What is rewritten: the start
 * points (their `url` and `vars`), the recipe's `vars` and `matrix`, and every
 * `url` in its steps and in `session.bootstrap`. Anything else, and every
 * other kind of recipe, is returned as it is; the recipe is not validated yet,
 * so nothing here assumes its shape.
 *
 * @param content - A decoded recipe.
 * @param folder - The absolute folder of the file it came from.
 * @returns The recipe, with those URLs absolute.
 */
export function resolveRecipeFileUrls (content: unknown, folder: string): unknown {
  if (!isRecord(content) || content.kind !== 'input') return content
  const resolved: Record<string, unknown> = { ...content }
  for (const key of ['start', 'vars', 'matrix'] as const) {
    if (Object.hasOwn(content, key)) resolved[key] = mapStrings(content[key], value => resolveFileUrl(value, folder))
  }
  if ('steps' in content) resolved.steps = mapUrls(content.steps, folder)
  if (isRecord(content.session) && 'bootstrap' in content.session) resolved.session = { ...content.session, bootstrap: mapUrls(content.session.bootstrap, folder) }

  return resolved
}

/** Every string, at any depth. */
function mapStrings (value: unknown, map: (text: string) => string): unknown {
  if (typeof value === 'string') return map(value)
  if (Array.isArray(value)) return value.map(entry => mapStrings(entry, map))
  if (!isRecord(value)) return value

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, mapStrings(entry, map)]))
}

/** Every string under a `url` key, at any depth: a `goto`, a `request`, a `paginate`'s `next`. */
function mapUrls (value: unknown, folder: string): unknown {
  if (Array.isArray(value)) return value.map(entry => mapUrls(entry, folder))
  if (!isRecord(value)) return value

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, key === 'url' && typeof entry === 'string' ? resolveFileUrl(entry, folder) : mapUrls(entry, folder)]))
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
