import type { Hook } from '../hooks'
import { httpTransport } from '../callout-transport'
import type { CalloutPollingOptions, HttpTransportOptions } from '../callout-transport'
import { calloutHook } from './callout-hook.use-case'

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
  return calloutHook(name, httpTransport(url, options), options)
}
