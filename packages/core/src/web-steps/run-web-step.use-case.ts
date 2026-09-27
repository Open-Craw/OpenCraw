import type { Page } from 'playwright'
import { nextFromDocument } from '../api-steps'
import { BrowserSession } from '../browser-session'
import type { CaptchaGuard } from '../captcha'
import type { EventBus } from '../crawl-events'
import type { ExtractionScope, LiveElement } from '../extraction-scope'
import type { CaptchaSubmitStep, GotoStep, InputRecipe, PaginateNext, Step } from '../recipe-schema'
import { HttpClient } from '../http-session'
import { BlockedError, RunGate } from '../step-flow'
import type { NextPageResult, StepRunner } from '../step-flow'
import { isTruthy, render, renderText } from '../template'
import { evaluateScript } from './evaluate-script.use-case'
import { extractFromPage } from './extract-from-page.use-case'
import { appears, click, fill, press, screenshot, scroll, select, wait } from './interact.use-case'
import { snapshotElements } from './snapshot-elements.use-case'
import { navigate } from './navigate.use-case'
import { followNavigation } from './follow-navigation.use-case'
import type { FollowOptions } from './follow-navigation.use-case'
import { sendPageRequest } from './send-page-request.use-case'
import { downloadByClick } from './download-by-click.use-case'

const NEXT_LINK_TIMEOUT_MS = 2000
/** How long a key press on the page, or a pick, is given to start a navigation. */
const LATE_NAVIGATION_MS = 150
/** Steps after which a page may show a new captcha (`session.captcha`). */
const CHALLENGING_STEPS = new Set<string>(['click', 'press'])

/**
 * Runs web-mode leaf steps on a browser page. With a captcha guard, a page a
 * navigation, click or key press leads to is checked for a challenge, solved
 * before the next step runs.
 */
export class WebStepRunner implements StepRunner {
  private readonly page: Page
  /** Requests through the page's own session, made on first use. */
  private requests:      HttpClient | undefined

  constructor (
    private readonly session: BrowserSession,
    private readonly recipe: InputRecipe,
    private readonly events: EventBus,
    private readonly gate: RunGate = new RunGate(1, recipe.limits?.delayMs ?? 0),
    private readonly captcha?: CaptchaGuard,
  ) {
    this.page = session.page
  }

  /** Clicks and key presses can navigate; keep `page.url` honest after every leaf step. */
  private trackUrl (scope: ExtractionScope): void {
    const url = this.page.url()
    if (scope.pageState?.url !== url) scope.setPage({ url })
  }

  /** Navigates; a block page showing a captcha is solved under `onBlock.solve`, and a page reached is checked for one. */
  private async visit (step: GotoStep, scope: ExtractionScope): Promise<void> {
    if (await this.solvingBlocks(() => navigate(step, this.page, scope, this.recipe, this.gate, this.events))) await this.captcha?.check(this.page)
  }

  /**
   * Runs an action that may navigate, checking the navigation it causes like a
   * `goto` (see `followNavigation`); a block page showing a captcha is solved under `onBlock.solve`.
   */
  private async follow (action: () => Promise<unknown>, options: Pick<FollowOptions, 'number' | 'graceMs' | 'gated' | 'alwaysVisit'>): Promise<void> {
    await this.solvingBlocks(() => followNavigation(this.page, action, { recipe: this.recipe, gate: this.gate, events: this.events, ...options }))
  }

  /** Runs a navigation; a block it meets is solved as a captcha under `onBlock.solve`. Returns `false` when it was. */
  private async solvingBlocks (run: () => Promise<void>): Promise<boolean> {
    try {
      await run()
    } catch (error) {
      if (!(error instanceof BlockedError) || this.captcha?.solvesBlocks !== true) throw error
      await this.captcha.solveBlock(this.page, error)

      return false
    }

    return true
  }

  /** A form captcha's `submit` steps: interactions, each under its `when`, without the automatic captcha check between them. */
  private async submit (steps: readonly CaptchaSubmitStep[], scope: ExtractionScope): Promise<void> {
    for (const step of steps) {
      if (step.when !== undefined && !isTruthy(render(step.when, path => scope.lookup(path)))) continue
      await this.perform(step, scope)
      this.trackUrl(scope)
    }
  }

  private async perform (step: Step, scope: ExtractionScope): Promise<void> {
    switch (step.type) {
      case 'goto': { await this.visit(step, scope); break
      }
      case 'captcha': {
        if (this.captcha === undefined) throw new Error('a captcha step needs a crawler with captcha solvers')
        const submit = step.submit
        await this.captcha.step(this.page, step, submit === undefined ? undefined : () => this.submit(submit, scope))
        break
      }
      case 'click': {
        await (step.download === undefined ? this.follow(() => click(step, this.page, scope), { number: pageNumber(scope) }) : downloadByClick(step, this.page, scope, this.recipe, this.events))
        break
      }
      case 'fill': { await fill(step, this.page, scope); break
      }
      case 'press': {
        // A key press on the page itself does not wait for the navigation it starts, as an element's does.
        await this.follow(() => press(step, this.page, scope), { number: pageNumber(scope), graceMs: step.selector === undefined && step.target === undefined ? LATE_NAVIGATION_MS : 0 })
        break
      }
      case 'select': {
        // A pick's change handler may navigate (a jump menu); the browser does not wait for it.
        await this.follow(() => select(step, this.page, scope, this.recipe.limits?.timeoutMs), { number: pageNumber(scope), graceMs: LATE_NAVIGATION_MS })
        break
      }
      case 'scroll': {
        const scrolled = await scroll(step, this.page)
        if (scrolled.capped) this.events.emit({ type: 'warning', recipeId: this.recipe.id, message: `scroll stopped at maxScrolls (${scrolled.scrolls}) while ${this.page.url()} was still growing`, meta: { url: this.page.url(), scrolls: scrolled.scrolls } })
        break
      }
      case 'wait': { await wait(step, this.page, this.recipe.limits?.timeoutMs); break
      }
      case 'screenshot': { await screenshot(step, this.page, scope); break
      }
      case 'evaluate': { await evaluateScript(step, this.page, scope); break
      }
      case 'request': {
        this.requests ??= HttpClient.over(this.page.context().request, this.recipe.limits?.timeoutMs, this.session.allowedHosts)
        await sendPageRequest(step, this.page, scope, this.requests, this.recipe, this.gate, this.events)
        break
      }
      case 'extract': { await extractFromPage(step, this.page, scope); break
      }
      default: { throw new Error(`"${step.type}" is an api step; this recipe runs in web mode`)
      }
    }
  }

  async runLeaf (step: Step, scope: ExtractionScope): Promise<void> {
    await this.perform(step, scope)
    if (CHALLENGING_STEPS.has(step.type)) await this.captcha?.check(this.page)
    this.trackUrl(scope)
  }

  async nextPage (next: PaginateNext, scope: ExtractionScope): Promise<NextPageResult> {
    // A cursor or URL in the JSON a `request` of the page body fetched.
    if ('jsonpath' in next) return nextFromDocument(next, scope)
    if ('url' in next) {
      const target = renderText(next.url, path => scope.lookup(path))
      if (target === '') return null
      await this.visit({ type: 'goto', url: target }, scope)

      return { kind: 'url', url: this.page.url() }
    }
    // The page body may have navigated away (a forEach visiting every item);
    // pagination continues from the listing page the body started on.
    const listing = scope.pageState?.url
    if (listing !== undefined && listing !== '' && this.page.url() !== listing) await this.page.goto(listing)
    const link = this.page.locator(next.selector).first()
    if (!await appears(link, NEXT_LINK_TIMEOUT_MS)) return null
    // The click is a request (it takes the site's turn); its navigation is checked like a goto's.
    // A next that swaps the content in place does not navigate: it gets a moment to do so, and counts as a page.
    await this.follow(() => link.click(), { number: pageNumber(scope) + 1, gated: true, graceMs: NEXT_LINK_TIMEOUT_MS / 4, alwaysVisit: true })
    await this.captcha?.check(this.page)

    return { kind: 'url', url: this.page.url() }
  }

  /**
   * A runner on a new tab of the same context, for one parallel iteration:
   * it shares cookies, the gate and the captcha guard; disposing it closes the tab only.
   *
   * @returns The forked runner.
   */
  async fork (): Promise<WebStepRunner> {
    const { context } = this.session
    const page = await context.newPage()
    const viewport = this.recipe.session?.viewport
    if (viewport !== undefined) await page.setViewportSize(viewport)

    return new WebStepRunner(new BrowserSession(context, page, async () => { await page.close() }), this.recipe, this.events, this.gate, this.captcha)
  }

  async elements (selector: string): Promise<LiveElement[]> {
    return snapshotElements(selector, this.page)
  }

  async dispose (): Promise<void> {
    await this.session.close()
  }
}

/** The number of the page a scope is on. */
function pageNumber (scope: ExtractionScope): number {
  return scope.pageState?.number ?? 1
}
