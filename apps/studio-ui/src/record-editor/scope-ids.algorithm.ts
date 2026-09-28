/**
 * The ids a recipe's steps bind, read straight off its raw (possibly
 * mid-edit) JSON: every step's `id`, and a `forEach`'s `as`, walked
 * recursively into `steps`/`else` bodies. Used for the Record tab's source
 * dropdown (studio plan §4.2, issue #92) — "the ids in scope at the emit
 * point" — as a flat superset of every id the recipe ever binds, not the
 * precise per-path scope `packages/studio`'s server-side `scopeAtPath`
 * computes (that slice is Node-only and not part of `@opencraw/studio`'s
 * browser-safe type-only surface; recomputing it client-side, precisely,
 * is future work). A field mapped to an id from inside a loop still needs
 * the loop's own `each`/`from: item.x` shape to read correctly — the
 * dropdown offers the name, it does not decide the rule's shape for you.
 *
 * @param content - The input recipe's parsed JSON (or any object with a `steps` array shaped like one).
 * @returns Every id/`as` found, in the order first seen, without duplicates.
 */
export function scopeIdsOf (content: unknown): string[] {
  const steps = stepsOf(content)
  if (steps === undefined) return []
  const ids: string[] = []
  collect(steps, ids)

  return ids
}

function collect (steps: unknown[], ids: string[]): void {
  for (const raw of steps) {
    if (typeof raw !== 'object' || raw === null) continue
    const step = raw as Record<string, unknown>
    for (const key of ['id', 'as']) {
      const value = step[key]
      if (typeof value === 'string' && value.length > 0 && !ids.includes(value)) ids.push(value)
    }
    const nested = stepsOf(step)
    if (nested !== undefined) collect(nested, ids)
    if (Array.isArray(step.else)) collect(step.else, ids)
  }
}

function stepsOf (value: unknown): unknown[] | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const steps = (value as { steps?: unknown }).steps

  return Array.isArray(steps) ? steps : undefined
}
