import type { DomPath, DomPathLevel } from './dom-path.model'
import { isStableId } from './dom-path.model'
import { stableClasses } from './class-token.policy'

/** The engine only ever runs `css` selectors from the studio (studio plan §3.2); xpath is a separate, text-only fallback the UI builds by hand. */
export type CandidateTier = 'id' | 'data-attr' | 'class' | 'structure' | 'position'

export interface SelectorCandidate {
  selector: string
  tier:     CandidateTier
}

/** Attributes ranked just under `id`: named explicitly, not "any `data-*`", because a generated `data-reactid` is no more stable than a generated class. */
const STABLE_ATTRS = ['data-testid', 'data-id', 'itemprop']

const TIER_ORDER: Record<CandidateTier, number> = { 'id': 0, 'data-attr': 1, 'class': 2, 'structure': 3, 'position': 4 }

/**
 * Every selector candidate worth trying for the last node of `path`, ranked
 * best-first: `id` > stable `data-*`/`itemprop` attributes > stable class
 * tokens > ancestor structure (`parent > tag`) > position (`nth-of-type`) as
 * a last resort (issue #91's ranking, studio plan §3.2). Structure and
 * position candidates only look as far up as `path` itself goes — pass a
 * sub-path (e.g. from an item's root down) to keep a field's selector
 * relative to its item instead of absolute to the document.
 *
 * @param path - The node's ancestry, root (or scope root) first, itself last.
 * @param includePosition - `false` for an item selector: a position candidate would only ever match one of the items, which is never what an item selector should do.
 * @returns Candidates, best tier first; ties keep this function's own order.
 */
export function candidatesFor (path: DomPath, includePosition = true): SelectorCandidate[] {
  const node = path.at(-1)
  if (node === undefined) return []
  const candidates: SelectorCandidate[] = []

  if (node.id !== undefined && isStableId(node.id)) candidates.push({ selector: `#${cssEscape(node.id)}`, tier: 'id' })

  for (const name of STABLE_ATTRS) {
    const value = node.attrs[name]
    if (value !== undefined && value.length > 0) candidates.push({ selector: `${node.tag}[${name}="${cssValue(value)}"]`, tier: 'data-attr' })
  }

  const classes = stableClasses(node.classes)
  if (classes.length > 0) candidates.push({ selector: `${node.tag}.${classes.map(token => cssEscape(token)).join('.')}`, tier: 'class' })

  candidates.push(...structureCandidates(path))
  if (includePosition) candidates.push(...positionCandidates(path))

  return sortByTier(candidates)
}

/** `ancestor > ... > tag`, growing from 2 to 4 levels (or to the top of `path`), each ancestor named by its own best simple form. */
function structureCandidates (path: DomPath): SelectorCandidate[] {
  const node = path.at(-1)
  if (node === undefined) return []
  const candidates: SelectorCandidate[] = []
  const maxDepth = Math.min(path.length - 1, 3)
  for (let depth = 1; depth <= maxDepth; depth++) {
    const ancestor = path.at(-1 - depth)
    if (ancestor === undefined) break
    const between = Array.from({ length: depth - 1 }, (_, index) => path.at(-depth + index)?.tag ?? '')
    const parts = [simpleSelector(ancestor), ...between, node.tag]
    candidates.push({ selector: parts.join(' > '), tier: 'structure' })
  }

  return candidates
}

/** `parent > tag:nth-of-type(n)`, the position-only fallback; never `nth-child`, which counts every sibling tag, not just this element's own. */
function positionCandidates (path: DomPath): SelectorCandidate[] {
  const node = path.at(-1)
  if (node === undefined) return []
  const own = node.siblingCount > 1 ? `${node.tag}:nth-of-type(${node.index})` : node.tag
  const parent = path.at(-2)
  if (parent === undefined) return [{ selector: own, tier: 'position' }]

  return [{ selector: `${simpleSelector(parent)} > ${own}`, tier: 'position' }]
}

/** A level's own selector fragment, no combinators: id, else stable classes, else the bare tag. */
function simpleSelector (level: DomPathLevel): string {
  if (level.id !== undefined && isStableId(level.id)) return `#${cssEscape(level.id)}`
  const classes = stableClasses(level.classes)

  return classes.length > 0 ? `${level.tag}.${classes.map(token => cssEscape(token)).join('.')}` : level.tag
}

function sortByTier (candidates: SelectorCandidate[]): SelectorCandidate[] {
  return [...candidates].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier])
}

/** Escapes a CSS identifier segment (an id or a class token) well enough for the shapes real sites use; not a full CSS.escape polyfill. */
function cssEscape (token: string): string {
  return token.replaceAll(/([^\w-])/gi, String.raw`\$1`)
}

/** Escapes a value inside `[name="…"]`. */
function cssValue (value: string): string {
  return value.replaceAll(/(["\\])/g, String.raw`\$1`)
}
