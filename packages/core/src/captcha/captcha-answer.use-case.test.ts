import type { Page } from 'playwright'
import { applyCaptchaAnswer } from './captcha-answer.use-case'

interface Call { selector: string, arg?: unknown, value?: string }

/** A page that records what is done to it; `evaluate` answers what the widget script would. */
function fakePage (evaluates = false) {
  const filled: Call[] = []
  const evaluated: Call[] = []
  const locator = (selector: string): unknown => ({
    first: () => locator(selector),
    fill:  (value: string) => {
      filled.push({ selector, value })

      return Promise.resolve()
    },
    evaluate: (_function: unknown, arg: unknown) => {
      evaluated.push({ selector, arg })

      return Promise.resolve(evaluates)
    },
  })

  return { page: { locator } as unknown as Page, filled, evaluated }
}

describe('applyCaptchaAnswer', () => {
  it('puts a widget token in the response fields of its kind, on the widget, and says it submitted when that happened', async () => {
    const { page, evaluated } = fakePage(true)

    const outcome = await applyCaptchaAnswer({ token: 'tok' }, { kind: 'hcaptcha', url: 'x', selector: '.h-captcha' }, page, 'callback-or-form')

    expect(outcome).toEqual({ status: 'solved', submitted: true })
    expect(evaluated).toEqual([{ selector: '.h-captcha', arg: { token: 'tok', fields: ['h-captcha-response', 'g-recaptcha-response'], submit: true } }])
  })

  it('works from the body when the challenge names no widget, and does not submit when told not to', async () => {
    const { page, evaluated } = fakePage(false)

    const outcome = await applyCaptchaAnswer({ token: 'tok' }, { kind: 'turnstile', url: 'x' }, page, 'none')

    expect(outcome).toEqual({ status: 'solved' })
    expect(evaluated).toEqual([{ selector: 'body', arg: { token: 'tok', fields: ['cf-turnstile-response'], submit: false } }])
  })

  it('types the text of an image captcha into the answer field', async () => {
    const { page, filled, evaluated } = fakePage()

    const outcome = await applyCaptchaAnswer({ text: 'K7Q2' }, { kind: 'image', url: 'x', field: '#code' }, page, 'callback-or-form')

    expect(outcome).toEqual({ status: 'solved' })
    expect(filled).toEqual([{ selector: '#code', value: 'K7Q2' }])
    expect(evaluated).toEqual([])
  })

  it('says why when the text has nowhere to go', async () => {
    const { page } = fakePage()

    const outcome = await applyCaptchaAnswer({ text: 'K7Q2' }, { kind: 'image', url: 'x' }, page, 'callback-or-form')

    expect(outcome).toMatchObject({ status: 'failed', reason: expect.stringContaining('no answer field') })
  })
})
