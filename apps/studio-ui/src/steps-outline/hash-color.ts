/**
 * A CSS color for a pill, stable for a given name across a session (a hash,
 * not a lookup table, so a new id gets a colour too): the same id always
 * gets the same hue, and different ids are spread around the wheel. Phase 2
 * reuses this to outline a pill's matches in the content pane; phase 1 just
 * colours the pill.
 *
 * @param name - The id (or built-in) the pill names.
 * @returns An `hsl(...)` string, readable text over it in either theme.
 */
export function hashColor (name: string): string {
  let hash = 0
  for (const char of name) hash = Math.trunc(hash * 31 + (char.codePointAt(0) ?? 0))
  const hue = Math.abs(hash) % 360

  return `hsl(${hue}, 65%, 42%)`
}
