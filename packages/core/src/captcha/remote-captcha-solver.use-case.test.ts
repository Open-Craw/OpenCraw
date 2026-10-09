import type { Page } from 'playwright'
import type { CalloutRequest, CalloutResponse } from '../callout-protocol'
import { withCalloutWaiter } from '../callout-transport'
import type { CalloutTransport } from '../callout-transport'
import { captchaCalloutInputSchema } from './captcha-callout.contract'
import type { CaptchaChallenge, CaptchaContext } from './captcha-solver.contract'
import { captchaSolverVia } from './remote-captcha-solver.use-case'

interface PageCalls {
  filled:    { selector: string, value: string }[]
  evaluated: { selector: string, arg: unknown }[]
}

/** A page that records what is done to it; `evaluate` answers `submitted`. */
function fakePage (submitted = false) {
  const calls: PageCalls = { filled: [], evaluated: [] }
  const locator = (selector: string): unknown => ({
    first: () => locator(selector),
    fill:  (value: string) => {
      calls.filled.push({ selector, value })

      return Promise.resolve()
    },
    evaluate: (_function: unknown, arg: unknown) => {
      calls.evaluated.push({ selector, arg })

      return Promise.resolve(submitted)
    },
    screenshot: () => Promise.resolve(Buffer.from('png-bytes')),
  })

  return { page: { locator } as unknown as Page, calls }
}

function transportAnswering (...answers: CalloutResponse[]) {
  const seen: CalloutRequest[] = []
  const transport: CalloutTransport = {
    label: 'fake service',
    call:  (request) => {
      seen.push(request)

      return Promise.resolve(answers[Math.min(seen.length, answers.length) - 1])
    },
  }

  return { transport, seen }
}

const widget: CaptchaChallenge = { kind: 'recaptcha-v2', url: 'https://shop.example/gate', siteKey: 'site-key', selector: '.g-recaptcha' }
const picture: CaptchaChallenge = { kind: 'image', url: 'https://shop.example/form', selector: '#code-image', field: '#code' }

function contextFor (page: Page, overrides: Partial<CaptchaContext> = {}): CaptchaContext {
  return { recipeId: 'shop', page, attempt: 1, signal: new AbortController().signal, log: () => undefined, ...overrides }
}

describe('captchaSolverVia', () => {
  it('asks for a captcha callout with the challenge and the attempt, in the published input shape', async () => {
    const { transport, seen } = transportAnswering({ status: 'ok', output: { token: 'tok' } })
    const { page } = fakePage()

    await captchaSolverVia('svc', transport).solve(widget, contextFor(page, { attempt: 2 }))

    expect(seen[0]).toMatchObject({ kind: 'captcha', name: 'svc', context: { recipeId: 'shop' } })
    expect(captchaCalloutInputSchema.parse(seen[0]?.input)).toEqual({ challenge: widget, attempt: 2 })
  })

  it('puts a token into the widget and reports it submitted when the callback or form went', async () => {
    const { transport } = transportAnswering({ status: 'ok', output: { token: 'tok' } })
    const { page, calls } = fakePage(true)

    const outcome = await captchaSolverVia('svc', transport).solve(widget, contextFor(page))

    expect(outcome).toEqual({ status: 'solved', submitted: true })
    expect(calls.evaluated[0]).toMatchObject({ selector: '.g-recaptcha', arg: { token: 'tok', fields: ['g-recaptcha-response'], submit: true } })
  })

  it('leaves the submit to the recipe when told to, so the steps run', async () => {
    const { transport } = transportAnswering({ status: 'ok', output: { token: 'tok' } })
    const { page, calls } = fakePage(false)

    const outcome = await captchaSolverVia('svc', transport, { submit: 'none' }).solve({ ...widget, kind: 'turnstile' }, contextFor(page))

    expect(outcome).toEqual({ status: 'solved' })
    expect(calls.evaluated[0]?.arg).toMatchObject({ fields: ['cf-turnstile-response'], submit: false })
  })

  it('sends an image captcha picture, and types the text into its field', async () => {
    const { transport, seen } = transportAnswering({ status: 'ok', output: { text: 'K7Q2' } })
    const { page, calls } = fakePage()

    const outcome = await captchaSolverVia('svc', transport).solve(picture, contextFor(page))

    expect((seen[0]?.input as { image: string }).image).toBe(Buffer.from('png-bytes').toString('base64'))
    expect(calls.filled).toEqual([{ selector: '#code', value: 'K7Q2' }])
    expect(outcome).toEqual({ status: 'solved' })
  })

  it('fails when text comes back for a challenge with nowhere to put it', async () => {
    const { transport } = transportAnswering({ status: 'ok', output: { text: 'K7Q2' } })
    const { page } = fakePage()

    const outcome = await captchaSolverVia('svc', transport).solve({ ...picture, field: undefined }, contextFor(page))

    expect(outcome).toMatchObject({ status: 'failed', reason: expect.stringContaining('no answer field') })
  })

  it('sends the proxy of the lease only when asked to', async () => {
    const lease = { profile: 'p', kind: 'proxy', proxy: { server: 'http://proxy:8080', username: 'u', password: 'secret' } }
    const without = transportAnswering({ status: 'ok', output: { token: 't' } })
    const withIt = transportAnswering({ status: 'ok', output: { token: 't' } })
    const { page } = fakePage()

    await captchaSolverVia('svc', without.transport).solve(widget, contextFor(page, { lease }))
    await captchaSolverVia('svc', withIt.transport, { sendProxy: true }).solve(widget, contextFor(page, { lease }))

    expect(JSON.stringify(without.seen[0])).not.toContain('secret')
    expect((withIt.seen[0]?.input as { proxy: unknown }).proxy).toEqual({ server: 'http://proxy:8080', username: 'u', password: 'secret' })
  })

  it('fails the attempt, with the reason, when the service reports an error or answers with nothing usable', async () => {
    const { page } = fakePage()

    const failed = await captchaSolverVia('svc', transportAnswering({ status: 'error', error: 'out of balance' }).transport).solve(widget, contextFor(page))
    const useless = await captchaSolverVia('svc', transportAnswering({ status: 'ok', output: { other: 1 } }).transport).solve(widget, contextFor(page))

    expect(failed).toEqual({ status: 'failed', reason: 'fake service: out of balance' })
    expect(useless).toMatchObject({ status: 'failed', reason: expect.stringContaining('not a token or a text') })
  })

  it('polls a pending answer on the live page, never parks it', async () => {
    const { transport, seen } = transportAnswering({ status: 'pending', retryAfterMs: 5 }, { status: 'ok', output: { token: 'tok' } })
    const { page } = fakePage(true)
    const waiter = { resolutions: {}, callbackFor: () => ({ url: 'https://host/cb' }), parked: [] }

    const outcome = await withCalloutWaiter(waiter, async () => await captchaSolverVia('svc', transport).solve(widget, contextFor(page)))

    expect(outcome).toMatchObject({ status: 'solved' })
    expect(seen).toHaveLength(2)
    expect(waiter.parked).toEqual([])
  })
})
