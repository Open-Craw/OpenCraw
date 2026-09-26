import type { RecipeReport } from './crawl-report.model'
import type { WorkOutcome } from './window-count.policy'

/**
 * How an item ended, for the pool: no error is a success; a captcha that beat
 * the solver or a browser that closed under the item says nothing about the
 * site's health, so the item goes back as it is and the pool does not move;
 * anything else (a block, retries used up, a timeout, a step that failed) is
 * a failure.
 *
 * @param report - The item's run.
 * @returns The outcome.
 */
export function defaultOutcome (report: RecipeReport): WorkOutcome {
  if (report.error === undefined) return 'success'
  if (report.errorKind === 'captcha' || report.errorKind === 'browser') return 'neutral'

  return 'failure'
}
