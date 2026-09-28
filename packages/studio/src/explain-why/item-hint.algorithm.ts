/**
 * A best-effort hint about what a missing value's bound id actually held in
 * the scope snapshot: the keys of an object, or the length of a list — the
 * fallback when there is no per-item DOM snapshot to compare a selector
 * against (see `why-sentence.mapper.ts`'s doc comment for why the richer,
 * "the item has `.price_new`" hint is out of this phase's scope).
 *
 * @param scope - The record's scope snapshot (`SampleRunRecord.scope`/`SampleRunRejected.scope`).
 * @param boundId - The leading id the rule's `from` reads.
 * @returns A short clause (no leading punctuation), or `undefined` when the id is not in scope or nothing useful can be said about it.
 */
export function hintFor (scope: Record<string, unknown> | undefined, boundId: string | undefined): string | undefined {
  if (scope === undefined || boundId === undefined) return undefined
  const value = scope[boundId]
  if (value === undefined) return undefined
  if (Array.isArray(value)) return value.length === 0 ? undefined : `"${boundId}" is a list of ${value.length}, not a single value`
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value)

    return keys.length === 0 ? undefined : `"${boundId}" has: ${keys.slice(0, 5).join(', ')}`
  }

  return undefined
}
