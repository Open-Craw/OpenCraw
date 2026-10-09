import { calloutRequest, CalloutError } from '../callout-protocol'
import { commandTransport, httpTransport, markCallout, settleCallout } from '../callout-transport'
import type { CalloutPollingOptions, CalloutTransport, CommandTransportOptions, HttpTransportOptions } from '../callout-transport'
import { applyCaptchaAnswer } from './captcha-answer.use-case'
import type { CaptchaSubmit } from './captcha-answer.use-case'
import { captchaCalloutOutputSchema } from './captcha-callout.contract'
import type { CaptchaCalloutInput } from './captcha-callout.contract'
import type { CaptchaSolver } from './captcha-solver.contract'

/** How a remote solver behaves, beyond how it is reached. */
export interface RemoteCaptchaSolverOptions extends CalloutPollingOptions {
  /** How long one solve may take when the recipe does not say. Default 120000: services take seconds to minutes. */
  timeoutMs?: number
  /** Send the proxy of the access lease with the challenge (credentials included), for services that solve from the same IP. Default false. */
  sendProxy?: boolean
  /** After a token is in the widget's fields: run its `data-callback`, or submit its form when it has none (default), or do nothing (the recipe's `submit` steps run). */
  submit?:    CaptchaSubmit
}

const DEFAULT_TIMEOUT_MS = 120_000

/**
 * A captcha solver that asks a handler outside the process (a program in any language, or a service) and
 * puts its answer on the page. The handler gets the challenge, and for an image captcha the picture, and
 * answers with a `token` or the `text`. A `pending` answer is polled, never parked: the page it is for has
 * to stay open.
 *
 * @param name - The solver's name in `session.captcha.solver`, sent in the request.
 * @param transport - How to reach the handler.
 * @param options - Timeout, whether to send the proxy, what to do after a token, and how long to wait.
 * @returns A solver for `captchaSolvers`.
 */
export function captchaSolverVia (name: string, transport: CalloutTransport, options: RemoteCaptchaSolverOptions = {}): CaptchaSolver {
  const solver: CaptchaSolver = {
    name,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    solve:     async (challenge, context) => {
      const lease = context.lease?.proxy
      const picture = challenge.kind === 'image' && challenge.selector !== undefined ? await context.page.locator(challenge.selector).first().screenshot() : undefined
      const input: CaptchaCalloutInput = {
        challenge: { ...challenge },
        attempt:   context.attempt,
        ...(picture !== undefined && { image: picture.toString('base64') }),
        ...(options.sendProxy === true && lease !== undefined && { proxy: { server: lease.server, username: lease.username, password: lease.password } }),
      }
      const request = calloutRequest({ kind: 'captcha', name, input, recipeId: context.recipeId })
      let output: unknown
      try {
        output = await settleCallout(transport.label, request.idempotencyKey, async () => await transport.call(request, context.log), { ...options, parkable: false, signal: context.signal })
      } catch (error) {
        return { status: 'failed', reason: error instanceof CalloutError ? error.message : String(error) }
      }
      const answer = captchaCalloutOutputSchema.safeParse(output)
      if (!answer.success) return { status: 'failed', reason: `${transport.label}: the answer is not a token or a text (${answer.error.issues[0]?.message ?? 'invalid'})` }

      return await applyCaptchaAnswer(answer.data, challenge, context.page, options.submit ?? 'callback-or-form')
    },
  }

  return markCallout(solver, transport.label)
}

/**
 * A captcha solver that runs a local program: the request is on its stdin, the answer on its stdout.
 *
 * @param name - The solver's name in `session.captcha.solver`.
 * @param command - The program and its arguments.
 * @param options - Transport and solver options.
 * @returns A solver for `captchaSolvers`.
 */
export function commandCaptchaSolver (name: string, command: readonly [string, ...string[]], options: RemoteCaptchaSolverOptions & CommandTransportOptions = {}): CaptchaSolver {
  return captchaSolverVia(name, commandTransport(command, options), options)
}

/**
 * A captcha solver that calls a service: the request is the body of a POST, the answer its response.
 *
 * @param name - The solver's name in `session.captcha.solver`.
 * @param url - The endpoint.
 * @param options - Transport and solver options.
 * @returns A solver for `captchaSolvers`.
 */
export function httpCaptchaSolver (name: string, url: string, options: RemoteCaptchaSolverOptions & HttpTransportOptions = {}): CaptchaSolver {
  return captchaSolverVia(name, httpTransport(url, options), options)
}
