import type { Step } from '@opencraw/core'

export type WaitStep = Extract<Step, { type: 'wait' }>

/** What happened right after the previous recorded action, before this one. */
export interface WaitContext {
  /** The previous action's click/key press changed the page. */
  navigated: boolean
  /** The page fetched something (XHR/`fetch`) since the previous action, without necessarily navigating. */
  xhr:       boolean
}

/**
 * Whether a `Wait for <selector>` step belongs between the action that just
 * happened and the next one (issue #95): after a navigation or an XHR, the
 * recorder inserts a wait for the element the person interacts with next, so
 * a replayed recipe does not race the page's own load. Nothing to wait for
 * without a next selector (a page-level key press, a scroll) — and no
 * navigation or fetch either: a recording of a page that never moves should
 * not fill up with waits nobody asked for.
 *
 * @param context - What happened since the previous action.
 * @param nextSelector - The next action's own resolved selector, when it has one.
 * @returns The wait step to insert before the next action's own step, or `undefined`.
 */
export function insertWaitStep (context: WaitContext, nextSelector: string | undefined): WaitStep | undefined {
  if (nextSelector === undefined || (!context.navigated && !context.xhr)) return undefined

  return { type: 'wait', selector: nextSelector }
}
