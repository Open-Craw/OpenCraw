import { CaptchaError } from '../captcha'
import { HttpError } from '../http-session'
import { BlockedError, NoMatchError, StepFailure } from '../step-flow'
import { errorKindOf } from './error-kind.mapper'

/** The kind of a step failure caused by `cause`. */
function kindOf (cause: unknown): string {
  return errorKindOf(new StepFailure('steps.3', 'click', cause))
}

describe('errorKindOf', () => {
  it('looks through the step failure to what caused it', () => {
    expect(kindOf(new CaptchaError('https://x/', 'image', 5, 'not solved'))).toBe('captcha')
    expect(kindOf(new BlockedError('https://x/', 403, 'HTTP 403'))).toBe('blocked')
    expect(kindOf(new Error('page.click: Target page, context or browser has been closed'))).toBe('browser')
    expect(kindOf(new HttpError(500, 'https://x/', { kind: 'text', text: '' }))).toBe('http')
    expect(kindOf(new Error('page.goto: Timeout 30000ms exceeded.'))).toBe('timeout')
    expect(kindOf(new Error('read ECONNRESET'))).toBe('network')
    expect(kindOf(new NoMatchError('#price'))).toBe('step')
    expect(errorKindOf(new Error('something else'))).toBe('error')
  })
})
