import type { Hook } from '../hooks'
import { hookRequest } from '../callout-protocol'
import { markCallout, settleCallout, withCallback } from '../callout-transport'
import type { CalloutPollingOptions, CalloutTransport } from '../callout-transport'

/**
 * A hook answered by any callout transport: the request goes out as a `CalloutRequest`, the answer comes
 * back as a `CalloutResponse`, and an answer of `pending` is asked again, with the same request (and so
 * the same idempotency key), after `retryAfterMs` until it settles or `maxWaitMs` passes. `commandHook`
 * and `httpHook` are this over a program and over HTTP; a host with its own channel (the driver, talking
 * to a client in another language) brings its own transport.
 *
 * @param name - The hook's name in the recipe, sent in the request.
 * @param transport - What carries the request and brings the answer back.
 * @param options - How long a `pending` answer may last.
 * @returns A hook to register under `name`.
 */
export function calloutHook (name: string, transport: CalloutTransport, options: CalloutPollingOptions = {}): Hook {
  const hook: Hook = async (input, args, context) => {
    const request = withCallback(hookRequest(name, input, args, context))

    return await settleCallout(transport.label, request.idempotencyKey, async () => await transport.call(request, context.log), options)
  }

  return markCallout(hook, transport.label)
}
