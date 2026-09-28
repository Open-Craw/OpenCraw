import type { Step } from '@opencraw/core'
import type { RecordedLink } from './recorded-action.contract'

/** `paginate`'s own `next` shape, `selector` form only — the only one a recorded click can offer. */
export type PaginateStep = Extract<Step, { type: 'paginate' }>

/** A `rel` token that means "the next page" on an `<a>`/`<link>`. */
const REL_NEXT = /(?:^|\s)next(?:\s|$)/i
/** Link text that reads as "next", loosely: "Next", "Next »", "Next page", punctuation and arrows ignored. */
const TEXT_NEXT = /^\s*next(?:\s*page)?\s*(?:[›»>]\s*)?$/i
/** The selector itself names the pattern (`li.next a`, `a[aria-label=Next]`) even when the reported text/rel do not. */
const SELECTOR_NEXT = /(?:^|[\s>.])li\.next\b|\[aria-label\s*=\s*['"]?next['"]?\]/i

/**
 * Whether a clicked, navigating element looks like a "next" link (issue
 * #95's exact heuristics): `rel="next"`, link text matching "next", or the
 * resolved selector itself carrying `li.next a`/`a[aria-label=Next]`. Only
 * meaningful for a click that navigated — the caller checks that first.
 *
 * @param link - The anchor's own `rel`/text/`aria-label`, as reported by `recorder-script.client.ts`.
 * @param selector - The action's resolved selector (`selector-inference`'s own candidate).
 * @returns Whether the studio should offer to turn this click into a `paginate` step.
 */
export function looksLikeNextLink (link: RecordedLink | undefined, selector: string | undefined): boolean {
  if (link?.rel !== undefined && REL_NEXT.test(link.rel)) return true
  if (link?.ariaLabel !== undefined && /^next$/i.test(link.ariaLabel.trim())) return true
  if (link?.text !== undefined && TEXT_NEXT.test(link.text)) return true
  if (selector !== undefined && SELECTOR_NEXT.test(selector)) return true

  return false
}

/**
 * The `paginate` step a "next" link's selector offers (studio plan §3.1/#95:
 * `For every page — click <selector>`), with an empty body: the studio
 * offers this shape, the person fills in what runs on each page.
 *
 * @param selector - The next link's resolved, verified selector.
 * @returns A `paginate` step, `next.selector` only.
 */
export function paginateStepFor (selector: string): PaginateStep {
  return { type: 'paginate', next: { selector }, steps: [] }
}
