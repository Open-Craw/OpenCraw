import type { Page } from 'playwright'
import type { CaptchaCalloutOutput } from './captcha-callout.contract'
import type { CaptchaChallenge, CaptchaOutcome } from './captcha-solver.contract'

/** The widget's response fields a token goes into, by kind of challenge. */
const RESPONSE_FIELDS: Record<string, string[]> = {
  'recaptcha-v2': ['g-recaptcha-response'],
  'recaptcha-v3': ['g-recaptcha-response'],
  'hcaptcha':     ['h-captcha-response', 'g-recaptcha-response'],
  'turnstile':    ['cf-turnstile-response'],
  'unknown':      ['g-recaptcha-response'],
}

/** What to do after the token is in the widget's fields. */
export type CaptchaSubmit = 'callback-or-form' | 'none'

/**
 * Puts a service's answer on the live page: an image captcha's text goes into the challenge's answer
 * field; a widget's token goes into its response fields and then, unless `submit` is `none`, the widget's
 * `data-callback` runs, or its form is submitted when it has none.
 *
 * @param answer - What the service answered with.
 * @param challenge - The challenge it was asked about.
 * @param page - The live page.
 * @param submit - Whether to run the callback or submit the form after a token.
 * @returns `solved` (with `submitted` when the callback ran or the form was submitted), or `failed`.
 */
export async function applyCaptchaAnswer (answer: CaptchaCalloutOutput, challenge: CaptchaChallenge, page: Page, submit: CaptchaSubmit): Promise<CaptchaOutcome> {
  if (answer.text !== undefined) {
    if (challenge.field === undefined) return { status: 'failed', reason: 'the service answered with text, but the challenge has no answer field: a captcha step with `image` names it in `field`' }
    await page.locator(challenge.field).fill(answer.text)

    return { status: 'solved' }
  }
  const fields = RESPONSE_FIELDS[challenge.kind] ?? ['g-recaptcha-response']
  const widget = challenge.selector === undefined ? page.locator('body') : page.locator(challenge.selector).first()
  const submitted = await widget.evaluate(putToken, { token: answer.token as string, fields, submit: submit === 'callback-or-form' })

  return submitted ? { status: 'solved', submitted: true } : { status: 'solved' }
}

/** Runs inside the page: keep it self-contained, it is serialised. */
function putToken (widget: HTMLElement, { token, fields, submit }: { token: string, fields: string[], submit: boolean }): boolean {
  const document = widget.ownerDocument
  for (const name of fields) {
    for (const input of document.getElementsByName(name)) (input as HTMLInputElement).value = token
  }
  if (!submit) return false
  const holder = widget.closest<HTMLElement>('[data-callback]')
  const callback = holder === null ? undefined : (document.defaultView as unknown as Record<string, unknown>)[holder.dataset.callback ?? '']
  if (typeof callback === 'function') {
    callback(token)

    return true
  }
  const form = widget.closest('form')
  if (form === null) return false
  form.submit()

  return true
}
