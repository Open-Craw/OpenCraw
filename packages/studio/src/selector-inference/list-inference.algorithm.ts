import type { DomPath, DomPathLevel } from './dom-path.model'
import { crossesShadowRoot } from './dom-path.model'
import { sameClassSignature, stableClasses } from './class-token.policy'
import { ShadowDomUnsupportedError } from './shadow-dom.error'

export interface ListInferenceResult {
  /**
   * The item's shape, generalised across both picks (root first, item
   * last): only the tag, the stable classes and the attributes the two
   * picked items actually share survive the merge. An id or a `data-id`
   * that differs per item (the ordinary case) is dropped here on purpose —
   * built into a selector it would match one item and silently miss every
   * other, which is a shifted-field-shaped bug in its own right even though
   * it is not the one issue #91 names.
   */
  itemPath:   DomPath
  /** The field's shape from the item down to the click, generalised the same way as `itemPath`, for a selector that reads `from` the item and still works on every item, not just the one it was picked from. */
  fieldPath:  DomPath
  /** The concrete path of the first click, item-relative (index 0 = the item), kept for provenance (e.g. the value the pick actually read). */
  fieldPathA: DomPath
  /** Same, for the second click. */
  fieldPathB: DomPath
}

/**
 * Infers "these two picks are the same field on two items of a list" from
 * two node paths, by walking up from both to the nearest ancestors that are
 * real siblings (the same parent) with the same tag and stable-class
 * signature — studio plan §3.2, issue #91. That ancestor is the item; the
 * remainder of each path is the field, relative to it.
 *
 * Because a `DomPath` is built root-down (`dom-path.model.ts`), two paths
 * from the same document are byte-for-byte identical up to their real
 * common ancestor and diverge exactly at its differing children — so the
 * *first* level where they differ is always the nearest-sibling test point;
 * there is no need to look further down. This also makes the "wrapper trap"
 * (an extra single-child element around each item) resolve itself: a
 * wrapper's own instances are never one another's siblings, only the
 * genuine repeating element is, so the walk naturally lands there instead of
 * on the wrapper (see the wrapper-trap fixture in this slice's tests).
 *
 * @param pathA - The first click's path.
 * @param pathB - The second click's path.
 * @returns The item and field shapes (generalised) plus each pick's raw path, or `null` when the two picks are not on a coherent list (different branches entirely, the same node twice, or one path nested inside the other).
 * @throws ShadowDomUnsupportedError when either path crosses a declarative shadow root.
 */
export function inferList (pathA: DomPath, pathB: DomPath): ListInferenceResult | null {
  if (crossesShadowRoot(pathA)) throw new ShadowDomUnsupportedError(pathToString(pathA))
  if (crossesShadowRoot(pathB)) throw new ShadowDomUnsupportedError(pathToString(pathB))

  let divergedAt = -1
  const limit = Math.min(pathA.length, pathB.length)
  for (let index = 0; index < limit; index++) {
    if (!sameLevel(pathA[index], pathB[index])) {
      divergedAt = index

      break
    }
  }
  // Identical paths, or one a strict prefix of the other (the same node picked twice, or one element nested inside the other): not a list.
  if (divergedAt <= 0) return null

  const branchA = pathA[divergedAt]
  const branchB = pathB[divergedAt]
  if (branchA.tag !== branchB.tag || !sameClassSignature(branchA.classes, branchB.classes)) return null
  if (branchA.index === branchB.index) return null // Same position: not two different items.

  const ancestors = pathA.slice(0, divergedAt)
  const fieldPathA = pathA.slice(divergedAt)
  const fieldPathB = pathB.slice(divergedAt)
  const fieldPath = mergeRelativePaths(fieldPathA, fieldPathB)

  return { itemPath: [...ancestors, fieldPath[0]], fieldPath, fieldPathA, fieldPathB }
}

function sameLevel (a: DomPath[number], b: DomPath[number]): boolean {
  return a.tag === b.tag && a.id === b.id && a.index === b.index && a.siblingCount === b.siblingCount && sameClassSignature(a.classes, b.classes)
}

/**
 * Zips two item-relative paths (item first) level by level into one that
 * only keeps what both share: the tag (must already match, checked by the
 * caller for level 0), the intersection of stable classes, and attributes
 * present with the same value on both sides. Shorter than the other when
 * the two picks' local structure differs in depth (a real possibility once
 * a field is missing on one item; `list-inference.algorithm.test.ts`'s
 * shifted-field fixture is exactly this) — the merge just stops there,
 * which is fine: a field selector only needs to reach as deep as the
 * shallower of the two picks.
 */
function mergeRelativePaths (a: DomPath, b: DomPath): DomPath {
  const length = Math.min(a.length, b.length)
  const merged: DomPath = []
  for (let index = 0; index < length; index++) {
    const left = a[index]
    const right = b[index]
    if (left.tag !== right.tag) break
    merged.push(mergeLevel(left, right))
  }

  return merged.length > 0 ? merged : [a[0]]
}

function mergeLevel (a: DomPathLevel, b: DomPathLevel): DomPathLevel {
  const classes = stableClasses(a.classes).filter(token => b.classes.includes(token))
  const attrs: Record<string, string> = {}
  for (const [name, value] of Object.entries(a.attrs)) {
    if (name !== 'class' && name !== 'id' && b.attrs[name] === value) attrs[name] = value
  }

  return { tag: a.tag, id: a.id !== undefined && a.id === b.id ? a.id : undefined, classes, attrs, index: 1, siblingCount: Math.max(a.siblingCount, b.siblingCount, 1) }
}

function pathToString (path: DomPath): string {
  return path.map(level => level.tag + (level.id === undefined ? '' : `#${level.id}`)).join(' > ')
}
