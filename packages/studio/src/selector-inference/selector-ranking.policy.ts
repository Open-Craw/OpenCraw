import { countMatches, matchesOf } from '@opencraw/core'
import type { SelectorCandidate } from './selector-candidates.algorithm'

const TIER_ORDER: Record<SelectorCandidate['tier'], number> = { 'id': 0, 'data-attr': 1, 'class': 2, 'structure': 3, 'position': 4 }

export interface RankedCandidate extends SelectorCandidate {
  /** How many elements this candidate matches in the document it was verified against. */
  matches:    number
  /** Whether it matches `targetNodeId` (when one was given); a candidate that misses its own target is worse than useless. */
  hitsTarget: boolean
}

/**
 * Verifies and orders selector candidates against real markup, by running
 * each one through the engine's own CSS matching (`@opencraw/core`'s
 * `countMatches`/`matchesOf`) rather than reimplementing it — issue #91's
 * "every candidate is verified" requirement.
 *
 * Ordering: candidates that do not match `targetNodeId` (when given) sort
 * last; among the rest, best tier first, and within a tier the fewest
 * matches first (the most specific selector that still hits the target).
 * A candidate matching nothing is dropped entirely: it is not a real option.
 *
 * @param html - The document to verify against (the snapshot, or the live page for the second, cross-check pass).
 * @param candidates - Unranked candidates, e.g. from `candidatesFor`.
 * @param targetNodeId - The `data-oc-node` id the pick landed on, when the document carries those stamps (the snapshot does; a live page fetched separately does not).
 * @returns Every candidate that matched at least one element, ranked best first.
 */
export function rankCandidates (html: string, candidates: readonly SelectorCandidate[], targetNodeId?: string): RankedCandidate[] {
  const ranked = candidates.map((candidate): RankedCandidate => {
    const matches = countMatches(html, candidate.selector)
    const hitsTarget = targetNodeId === undefined || matches === 0 ? targetNodeId === undefined : matchesOf(html, candidate.selector).includes(targetNodeId)

    return { ...candidate, matches, hitsTarget }
  })

  return ranked
    .filter(candidate => candidate.matches > 0)
    .sort((a, b) => Number(b.hitsTarget) - Number(a.hitsTarget) || TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.matches - b.matches)
}

/** The single best candidate, or `undefined` when none of them matched anything. */
export function bestCandidate (html: string, candidates: readonly SelectorCandidate[], targetNodeId?: string): RankedCandidate | undefined {
  return rankCandidates(html, candidates, targetNodeId)[0]
}
