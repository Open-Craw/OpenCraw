import type { Page, Response } from 'playwright'
import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import { resolveRequestUrl } from '../http-session'
import type { GotoStep, InputRecipe } from '../recipe-schema'
import { detectBlock, resolveRetryRule, transientError, withTransportRetry } from '../step-flow'
import type { ResolvedRetryRule, RunGate, Transient } from '../step-flow'
import { renderText } from '../template'
import { appears } from './interact.use-case'

/** How many times a page that never shows its `ready` element is loaded again, by default. */
const DEFAULT_RELOADS = 2
const DEFAULT_READY_TIMEOUT_MS = 30_000

/**
 * Runs a `goto` step: renders the URL (relative to the current page), waits for
 * the gate's throttle (`delayMs`), navigates (again, after a pause, while it
 * fails in passing: `limits.retry`), records the page's real URL in the scope,
 * and checks the response against the recipe's block rule. With `ready`, the
 * page must show that element; one that does not is loaded again (a site that
 * sometimes serves its shell without the content), up to `ready.reloads` times.
 *
 * @throws BlockedError when the response is a block.
 * @throws Error when the `ready` element never shows.
 */
export async function navigate (step: GotoStep, page: Page, scope: ExtractionScope, recipe: InputRecipe, gate: RunGate, events: EventBus): Promise<void> {
  const target = renderText(step.url, path => scope.lookup(path))
  const url = resolveRequestUrl(target, scope.pageState?.url ?? page.url(), process.cwd())
  await load(step, url, page, scope, recipe, gate, events)
  const ready = step.ready
  if (ready === undefined) return
  const reloads = ready.reloads ?? DEFAULT_RELOADS
  const timeout = ready.timeoutMs ?? recipe.limits?.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS
  for (let reload = 1; !await appears(page.locator(ready.selector).first(), timeout); reload += 1) {
    if (reload > reloads) throw new Error(`${url} never showed "${ready.selector}" (${reloads + 1} load${reloads === 0 ? '' : 's'}, ${timeout} ms each)`)
    events.emit({ type: 'request:retry', recipeId: recipe.id, url, attempt: reload + 1, reason: `"${ready.selector}" did not show`, delayMs: 0 })
    await load(step, url, page, scope, recipe, gate, events)
  }
}

/** Loads the page once (with the transport retries), records it, and checks it for a block. */
async function load (step: GotoStep, url: string, page: Page, scope: ExtractionScope, recipe: InputRecipe, gate: RunGate, events: EventBus): Promise<void> {
  const rule = resolveRetryRule(recipe.limits?.retry)
  const response = await withTransportRetry(url, {
    run:     () => page.goto(url, { waitUntil: step.waitUntil, timeout: recipe.limits?.timeoutMs }),
    problem: navigationProblem(rule),
  }, { recipeId: recipe.id, gate, events, rule })
  scope.setPage({ url: page.url() })
  await reportVisit(page, response, scope.pageState?.number ?? 1, recipe, events)
}

/**
 * How a navigation's outcome is judged for a retry: a connection that failed
 * in passing, or a status the retry rule lists (with the server's `Retry-After`).
 *
 * @param rule - The recipe's resolved retry rule.
 * @returns The judge `withTransportRetry` takes.
 */
export function navigationProblem (rule: ResolvedRetryRule): (outcome: { value: Response | null } | { error: unknown }) => Transient | undefined {
  return (outcome) => {
    if ('error' in outcome) return transientError(outcome.error)
    const status = outcome.value?.status()

    return status !== undefined && rule.statuses.includes(status) ? { reason: `HTTP ${status}`, retryAfter: outcome.value?.headers()['retry-after'] } : undefined
  }
}

/**
 * Reports the page a navigation reached as `page:visit` (with its status), and
 * checks the response against the recipe's block rule. A browser error page
 * (`chrome-error://`) is never a page: it fails instead.
 *
 * @param page - The page, on the document the navigation reached.
 * @param response - The navigation's response; `null` when there was none (a same-document navigation).
 * @param number - The page number to report.
 * @param recipe - The recipe: id and block rule.
 * @param events - Where the visit is reported.
 * @throws BlockedError when the response is a block; Error on a browser error page.
 */
export async function reportVisit (page: Page, response: Response | null, number: number, recipe: InputRecipe, events: EventBus): Promise<void> {
  if (isErrorPage(page.url())) throw new Error(`the browser shows its error page instead of ${response?.url() ?? 'the page'}`)
  events.emit({ type: 'page:visit', recipeId: recipe.id, url: page.url(), number, status: response?.status() })
  if (response === null) return
  const blocked = await detectBlock({ url: page.url(), status: response.status(), headers: response.headers(), text: () => response.text() }, recipe.session?.blockedWhen)
  if (blocked !== undefined) throw blocked
}

/**
 * Whether a URL is the browser's own error page, which Chromium shows when a navigation fails.
 *
 * @param url - The page URL.
 * @returns `true` for `chrome-error://…`.
 */
export function isErrorPage (url: string): boolean {
  return url.startsWith('chrome-error:')
}
