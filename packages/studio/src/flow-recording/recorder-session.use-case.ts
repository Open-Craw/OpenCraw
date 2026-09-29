import type { Page, Response } from 'playwright'
import type { BrowserSessionConfig, Step } from '@opencraw/core'
import { BrowserProfiles } from '@opencraw/core'
import { ensureBrowserLaunch } from '../browser-provisioning'
import { recipeToOutline } from '../scope-outline'
import { bestCandidate, candidatesFor, crossesShadowRoot, pathToNode } from '../selector-inference'
import type { OutlineNode } from '../studio-api'
import { actionToStep } from './action-to-step.mapper'
import { looksLikeNextLink } from './next-link.policy'
import { rawActionSchema } from './recorded-action.contract'
import type { RawAction, ResolvedAction } from './recorded-action.contract'
import { recorderScript } from './recorder-script.client'
import { isSecretField, secretPlaceholder } from './secret-field.policy'
import { insertWaitStep } from './wait-insertion.policy'
import type { WaitContext } from './wait-insertion.policy'

/** The name Playwright's `context.exposeBinding` gives the function `recorder-script.client.ts` calls. */
const REPORT_BINDING = '__opencraw_recorder_report__'
/** The studio's own recorder profile: never a crawl's own profile, never the person's default browser (issue #95). */
const RECORDER_PROFILE_NAME = 'studio-recorder'
/** How long a click/key press is given to start a navigation before it counts as not having navigated. */
const NAVIGATION_GRACE_MS = 600

export interface RecorderNote {
  kind:    'next-link' | 'unsupported' | 'info'
  message: string
}

/** Where recorded actions and notices go as a recording proceeds. */
export interface RecorderCallbacks {
  onCard: (node: OutlineNode, secret: boolean) => void
  onNote: (note: RecorderNote) => void
}

export interface RecorderSessionOptions {
  /** The page the headed window opens on. */
  startUrl:   string
  /** Where the studio's own recorder profiles live — see `BrowserProfiles`; never the folder a crawl's own `session.browserProfile` uses. */
  profileDir: string
  /** Browser launch settings; `headless` is always forced `false` — a recording is, by definition, a window the person watches and drives. */
  browser?:   BrowserSessionConfig
}

/**
 * A recording in progress: `stop` closes the window and hands back every
 * step recorded, in order. `page` is the window's own live Playwright page
 * — public the same way `BrowserSession.page` already is, for a caller (a
 * future embedded view, this phase's own e2e test driving the window "as
 * the person would") that needs to reach the live window itself, not just
 * the reported actions.
 */
export interface RecorderSessionHandle {
  page: Page
  stop: () => Promise<{ steps: Record<string, unknown>[] }>
}

/**
 * Opens the headed browser window a flow is recorded in (issue #95, studio
 * plan §3.1's last paragraph / phase 6): a Playwright persistent context, in
 * the studio's own profile (`BrowserProfiles`, `headless: false` — the only
 * precedent this codebase already has for a headed launch,
 * `packages/core/src/browser-session/browser-profile.store.ts`), with
 * `recorder-script.client.ts` installed on every page
 * (`context.addInitScript`) and reporting through a context-wide binding
 * (`context.exposeBinding`, so a page opened mid-recording — a link with
 * `target=_blank`, say — is covered too, not only the first page).
 *
 * Each reported action is resolved into a verified selector
 * (`selector-inference`, against the page's own current markup — issue
 * #95's "verified against the page"), turned into a step
 * (`action-to-step.mapper.ts`), and broadcast as an outline card built by
 * `scope-outline`'s own `recipeToOutline` — the same sentence/bracket logic
 * every other phase's cards already go through, never a second card format.
 * A secret field's value is replaced by its `{{env.NAME}}` placeholder
 * before it reaches a step, a card, or this function's return value: the
 * real value is discarded the instant `secret-field.policy.ts` flags the
 * field, never logged, never kept.
 *
 * Recording inside an iframe or shadow DOM is out of this phase's scope
 * (issue #95): `recorder-script.client.ts` detects both and reports them as
 * `unsupported` notes instead of guessing at a selector that would not
 * verify.
 *
 * @param options - The start URL, the profile directory, and browser launch settings.
 * @param callbacks - Where cards and notices go as they happen.
 * @returns A handle: `stop` closes the window and returns every step recorded.
 */
export async function openRecorderSession (options: RecorderSessionOptions, callbacks: RecorderCallbacks): Promise<RecorderSessionHandle> {
  const profiles = new BrowserProfiles(options.profileDir, { ...options.browser, headless: false })
  const session = await ensureBrowserLaunch(options.browser, () => profiles.open(RECORDER_PROFILE_NAME, {}, {}))
  const context = session.context
  const steps: Step[] = []
  let closed = false
  let waitPending: WaitContext = { navigated: false, xhr: false }
  let xhrSeen = false

  context.on('response', (response: Response) => {
    const type = response.request().resourceType()
    if (type === 'xhr' || type === 'fetch') xhrSeen = true
  })
  await context.exposeBinding(REPORT_BINDING, (_source: unknown, raw: unknown) => { void handleRaw(raw) })
  await context.addInitScript({ content: recorderScript(REPORT_BINDING) })
  await session.page.goto(options.startUrl)

  async function handleRaw (raw: unknown): Promise<void> {
    if (closed) return
    const parsed = rawActionSchema.safeParse(raw)
    if (!parsed.success) return
    const action = parsed.data
    if (action.kind === 'unsupported') {
      callbacks.onNote({ kind: 'unsupported', message: `recording inside ${action.reason === 'iframe' ? 'an iframe' : 'shadow DOM'} is not supported; continue outside it, or add this step by hand` })

      return
    }
    await handleAction(action)
  }

  async function handleAction (action: Exclude<RawAction, { kind: 'unsupported' }>): Promise<void> {
    const page = session.page
    const urlBefore = page.url()
    xhrSeen = false
    const resolved = resolveAction(action)
    if (resolved === undefined) return
    if (action.kind === 'click' || action.kind === 'keypress') resolved.navigated = await detectNavigation(page, urlBefore)

    if (resolved.field !== undefined && resolved.value !== undefined && isSecretField(resolved.field)) resolved.value = secretPlaceholder(resolved.field)

    const waitStep = insertWaitStep(waitPending, resolved.selector)
    if (waitStep !== undefined) pushStep(waitStep, false)
    waitPending = { navigated: resolved.navigated !== undefined, xhr: xhrSeen }

    const step = actionToStep(resolved)
    if (step === undefined) return
    pushStep(step, resolved.field !== undefined && isSecretField(resolved.field))

    if (resolved.navigated !== undefined && action.kind === 'click' && looksLikeNextLink(resolved.link, resolved.selector)) {
      callbacks.onNote({ kind: 'next-link', message: `this click looks like a "next" link — turn it into "For every page — click ${resolved.selector ?? ''}"?` })
    }
  }

  function pushStep (step: Step, secret: boolean): void {
    steps.push(step)
    const outline = recipeToOutline({ steps })
    const node = outline.steps.at(-1)
    if (node !== undefined) callbacks.onCard(node, secret)
  }

  return {
    page: session.page,
    stop: async () => {
      if (!closed) {
        closed = true
        await session.close()
      }

      return { steps: steps as unknown as Record<string, unknown>[] }
    },
  }
}

/**
 * Resolves one raw action's `nodeId` (when it has one — `scroll` and a
 * page-level `keypress` do not) into a verified selector, the same way
 * `infer-selector.handler.ts` does for a pick: `pathToNode` off the
 * document the action itself carries (`action.html`, captured by
 * `recorder-script.client.ts` at the moment of the event — see
 * `recorded-action.contract.ts` for why that beats a later `page.content()`),
 * `candidatesFor`/`bestCandidate` off that path.
 *
 * @param action - The raw action, `unsupported` already ruled out by the caller.
 * @returns The resolved action (selector filled in where relevant), or `undefined` when no candidate verified — the action is dropped rather than recorded with a guessed, unverified selector.
 */
function resolveAction (action: Exclude<RawAction, { kind: 'unsupported' }>): ResolvedAction | undefined {
  if (action.kind === 'scroll') return { kind: 'scroll' }
  if (action.kind === 'keypress' && action.nodeId === undefined) return { kind: 'keypress', key: action.key }
  const nodeId = action.nodeId
  const html = action.html
  if (nodeId === undefined || html === undefined) return undefined

  const path = pathToNode(html, nodeId)
  if (path === undefined || crossesShadowRoot(path)) return undefined
  const best = bestCandidate(html, candidatesFor(path), nodeId)
  if (best === undefined) return undefined

  switch (action.kind) {
    case 'click': { return { kind: 'click', selector: best.selector, link: action.link }
    }
    case 'fill': { return { kind: 'fill', selector: best.selector, value: action.value, field: action.field }
    }
    case 'select': { return { kind: 'select', selector: best.selector, value: action.value, field: action.field }
    }
    case 'keypress': { return { kind: 'keypress', selector: best.selector, key: action.key }
    }
  }
}

/**
 * Whether, and where to, the page navigated within `NAVIGATION_GRACE_MS` of
 * a click or key press: polled rather than driven (the navigation, if any,
 * was started by the person in the live window, not by this function), with
 * the main frame's own navigation response (for its status) picked up
 * alongside.
 *
 * @param page - The recorder's own page.
 * @param urlBefore - `page.url()` right before the action was reported.
 * @returns The page reached and its status, or `undefined` when the URL never changed.
 */
async function detectNavigation (page: Page, urlBefore: string): Promise<{ url: string, status?: number } | undefined> {
  let response: Response | undefined
  const onResponse = (candidate: Response): void => {
    if (candidate.request().isNavigationRequest() && candidate.frame() === page.mainFrame()) response = candidate
  }
  page.on('response', onResponse)
  const deadline = Date.now() + NAVIGATION_GRACE_MS
  try {
    while (Date.now() < deadline && page.url() === urlBefore) {
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  } finally {
    page.off('response', onResponse)
  }
  if (page.url() === urlBefore) return undefined
  try {
    await page.waitForLoadState('load', { timeout: NAVIGATION_GRACE_MS })
  } catch {
    // The load event never fired within the grace period; the page still moved, so report it anyway.
  }

  return { url: page.url(), status: response?.status() }
}
