import type { Hook } from '../hooks'
import { hookRequest } from '../callout-protocol'
import { httpTransport, settleCallout, withCallback } from '../callout-transport'
import type { CalloutPollingOptions, HttpTransportOptions } from '../callout-transport'

/** Timeout, secrets and allowed hosts (per POST), and how long a `pending` answer may last. */
export type HttpHookOptions = HttpTransportOptions & CalloutPollingOptions

/**
 * A hook that calls a service: the request goes in the body of a POST as JSON, and the response body is
 * the answer (`{"status":"ok","output":…}`). The URL and the secrets come from the trusted hooks module,
 * never from a recipe, and the secrets are named environment variables, never values. An answer of
 * `pending` posts the same request again (same idempotency key) after `retryAfterMs`, until the service
 * settles or `maxWaitMs` passes.
 *
 * @param name - The hook's name in the recipe, sent in the request.
 * @param url - The endpoint.
 * @param options - Timeout, secrets, the hosts the endpoint may be on and how long to wait.
 * @returns A hook to register under `name`.
 * @throws HostNotAllowedError When `options.allowedHosts` is set and `url` is not on it.
 */
export function httpHook (name: string, url: string, options: HttpHookOptions = {}): Hook {
  const transport = httpTransport(url, options)

  return async (input, args, context) => {
    const request = withCallback(hookRequest(name, input, args, context))

    return await settleCallout(transport.label, request.idempotencyKey, async () => await transport.call(request, context.log), options)
  }
}
