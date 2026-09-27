import type { Frame, Page, Request, Response } from 'playwright'
import type { EventBus } from '../crawl-events'
import type { InputRecipe } from '../recipe-schema'
import { resolveRetryRule, withTransportRetry } from '../step-flow'
import type { RunGate } from '../step-flow'
import { isErrorPage, navigationProblem, reportVisit } from './navigate.use-case'

const DEFAULT_TIMEOUT_MS = 30_000
/** Answers after which the browser stays on the page it was on. */
const NO_CONTENT = new Set([204, 205])
/** How long a redirect is given to start its next request. */
const REDIRECT_WAIT_MS = 5000

/** How to follow what an action does to the page. */
export interface FollowOptions {
  recipe:       InputRecipe
  gate:         RunGate
  events:       EventBus
  /** The page number a visit is reported under. */
  number:       number
  /** How long to wait for a navigation the action did not start at once: a script that navigates a moment later, or a key press. */
  graceMs?:     number
  /** The action is a request (a pagination click): it takes the site's turn in the gate. */
  gated?:       boolean
  /** Report a visit even when the action did not navigate: paginate's next page, swapped in place by the page's scripts. */
  alwaysVisit?: boolean
}

/** A main-frame navigation an action started, and what its first try came to. */
interface Navigation {
  url:     string
  method:  string
  outcome: { value: Response | null } | { error: unknown }
}

/**
 * Runs an action that may navigate the page (a click, a key press, a pick)
 * and checks the main-frame navigation it causes, the way `goto` checks its own:
 *
 * - it waits for the navigation's response and the new page's `load`;
 * - a connection that failed in passing, or a status in `limits.retry.statuses`,
 *   is retried by loading the URL the action navigated to again (a GET; a form
 *   post is never sent twice), not by repeating the action, which may no longer
 *   be possible on the page the failure left;
 * - a status still in the retry list once the tries are spent, or a failure,
 *   fails with its cause (`HTTP 503 at …`, `net::ERR_… at …`): the browser's
 *   error page is never taken for the page;
 * - the page reached is reported as `page:visit` with its status, and checked
 *   against the block rule.
 *
 * An action that does not navigate leaves the page alone; a URL the page's
 * scripts changed in place (`history.pushState`) is reported as a visit without
 * a status.
 *
 * @param page - The page.
 * @param action - What may navigate.
 * @param options - The recipe, gate, events and page number; how long to wait for a late navigation.
 * @throws BlockedError when the page reached is a block; Error when the navigation failed.
 */
export async function followNavigation (page: Page, action: () => Promise<unknown>, options: FollowOptions): Promise<void> {
  const { recipe, gate, events } = options
  const timeoutMs = recipe.limits?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const watch = new NavigationWatch(page)
  let navigation: Navigation | undefined
  try {
    const release = options.gated === true ? await gate.request(page.url()) : undefined
    try {
      await action()
      navigation = await watch.settle(options.graceMs ?? 0, timeoutMs)
    } finally {
      release?.()
    }
  } finally {
    watch.stop()
  }
  if (navigation === undefined) {
    if (isErrorPage(page.url())) throw new Error('the browser shows its error page')
    if (options.alwaysVisit === true || watch.moved()) events.emit({ type: 'page:visit', recipeId: recipe.id, url: page.url(), number: options.number })

    return
  }
  const { url, method } = navigation
  const rule = resolveRetryRule(recipe.limits?.retry)
  const judge = navigationProblem(rule)
  const response = await withTransportRetry(url, {
    made:    navigation.outcome,
    run:     () => page.goto(url, { timeout: timeoutMs }),
    problem: outcome => (method === 'GET' ? judge(outcome) : undefined),
  }, { recipeId: recipe.id, gate, events, rule })
  await reportVisit(page, response, options.number, recipe, events)
  const status = response?.status()
  if (status !== undefined && rule.statuses.includes(status)) throw new Error(`HTTP ${status} at ${page.url()}`)
}

/**
 * Watches the main frame while an action runs: the navigation requests it
 * starts (a redirect adds one) and the documents it commits.
 */
class NavigationWatch {
  private readonly requests: Request[] = []
  /** How many commits the frame had made when each request started. */
  private readonly commitsAt = new Map<Request, number>()
  private commits = 0
  private readonly before:   string
  private wake:              (() => void) | undefined

  private readonly onRequest = (request: Request): void => {
    if (!this.isMainNavigation(request)) return
    this.requests.push(request)
    this.commitsAt.set(request, this.commits)
    this.nudge()
  }

  private readonly onFrame = (frame: Frame): void => {
    if (frame !== this.page.mainFrame()) return
    this.commits += 1
    this.nudge()
  }

  constructor (private readonly page: Page) {
    this.before = page.url()
    page.on('request', this.onRequest)
    page.on('framenavigated', this.onFrame)
  }

  /** The navigation's outcome once its final response came: a failure, or the new document loaded. */
  private async outcomeOf (request: Request, response: Response | null, timeoutMs: number): Promise<Navigation | undefined> {
    if (response === null) {
      const reason = request.failure()?.errorText ?? 'the navigation failed'
      // A navigation the page cancelled, or one that turned into a download: the page stays.
      if (reason.includes('ERR_ABORTED') && !isErrorPage(this.page.url())) return undefined

      return failed(request, `${reason} at ${request.url()}`)
    }
    if (NO_CONTENT.has(response.status())) return undefined
    const since = this.commitsAt.get(request) ?? 0
    if (!await this.until(() => this.commits > since, timeoutMs)) return failed(request, `Timeout ${timeoutMs}ms exceeded waiting for ${request.url()} to show`)
    try {
      await this.page.waitForLoadState('load', { timeout: timeoutMs })
    } catch (error) {
      return { url: request.url(), method: request.method(), outcome: { error } }
    }
    if (isErrorPage(this.page.url())) return failed(request, `${request.failure()?.errorText ?? 'the page failed to load'} at ${request.url()}`)

    return { url: request.url(), method: request.method(), outcome: { value: response } }
  }

  private isMainNavigation (request: Request): boolean {
    try {
      return request.isNavigationRequest() && request.frame() === this.page.mainFrame()
    } catch {
      // a service worker's request has no frame
      return false
    }
  }

  private nudge (): void {
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }

  /** Waits until `test` holds, up to `ms`; re-checks on every request or commit. */
  private async until (test: () => boolean, ms: number): Promise<boolean> {
    const deadline = Date.now() + ms
    while (!test()) {
      const left = deadline - Date.now()
      if (left <= 0) return false
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left)
        this.wake = () => {
          clearTimeout(timer)
          resolve()
        }
      })
    }

    return true
  }

  stop (): void {
    this.page.off('request', this.onRequest)
    this.page.off('framenavigated', this.onFrame)
  }

  /** Whether the page's URL changed, the fragment aside. */
  moved (): boolean {
    return withoutHash(this.page.url()) !== withoutHash(this.before)
  }

  /**
   * Waits for the navigation the action started, if any: up to `graceMs` for
   * it to start, then for its final response (past redirects) and the new
   * document's `load`.
   *
   * @returns The navigation and its outcome; `undefined` when the page stayed.
   */
  async settle (graceMs: number, timeoutMs: number): Promise<Navigation | undefined> {
    const started = await this.until(() => this.requests.length > 0 || this.page.url() !== this.before, graceMs)
    let request = this.requests.at(-1)
    if (!started || request === undefined) return undefined
    for (;;) {
      const current: Request = request
      const answer: { response?: Response | null } = {}
      void current.response()
        .then((value) => { answer.response = value })
        .catch(() => { answer.response = null })
        .finally(() => { this.nudge() })
      if (!await this.until(() => answer.response !== undefined || this.requests.at(-1) !== current, timeoutMs)) return failed(current, `Timeout ${timeoutMs}ms exceeded waiting for ${current.url()}`)
      const status = answer.response?.status()
      // A redirect, or a newer navigation that replaced this one: follow the last.
      if (status !== undefined && status >= 300 && status < 400) await this.until(() => this.requests.at(-1) !== current, Math.min(timeoutMs, REDIRECT_WAIT_MS))
      request = this.requests.at(-1) ?? current
      if (request === current) return this.outcomeOf(current, answer.response ?? null, timeoutMs)
    }
  }
}

function failed (request: Request, message: string): Navigation {
  return { url: request.url(), method: request.method(), outcome: { error: new Error(message) } }
}

function withoutHash (url: string): string {
  const at = url.indexOf('#')

  return at === -1 ? url : url.slice(0, at)
}
