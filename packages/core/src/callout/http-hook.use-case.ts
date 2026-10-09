import { createHmac } from 'node:crypto'
import type { Hook } from '../hooks'
import { HostAllowlist } from '../host-allowlist'
import { hookRequest } from './callout-request.algorithm'
import { outputOfAnswer, parseAnswer } from './callout-response.algorithm'
import { CalloutError } from './callout.error'

export interface HttpHookOptions {
  /** Milliseconds before the call is abandoned. Default 30000. */
  timeoutMs?:     number
  /** The name of an environment variable holding a bearer token, sent as `authorization: Bearer …`. The value never appears in a recipe or in an error. */
  tokenEnv?:      string
  /** The name of an environment variable holding a secret; the body is signed with it (HMAC-SHA256, hex) in `x-opencraw-signature: sha256=…`, so the service can check who is calling. */
  signingKeyEnv?: string
  /** Hosts the endpoint may be on (the allowlist patterns the crawler uses). Naming an endpoint outside them throws when the hook is made. */
  allowedHosts?:  readonly string[]
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * A hook that calls a service: the request goes in the body of a POST as JSON, and the response body is
 * the answer (`{"status":"ok","output":…}`). The URL and the secrets come from the trusted hooks module,
 * never from a recipe, and the secrets are named environment variables, never values.
 *
 * @param name - The hook's name in the recipe, sent in the request.
 * @param url - The endpoint.
 * @param options - Timeout, secrets and the hosts the endpoint may be on.
 * @returns A hook to register under `name`.
 * @throws HostNotAllowedError When `options.allowedHosts` is set and `url` is not on it.
 */
export function httpHook (name: string, url: string, options: HttpHookOptions = {}): Hook {
  const label = `POST ${url}`
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  HostAllowlist.of(options.allowedHosts)?.assert(url)

  return async (input, args, context) => {
    const request = hookRequest(name, input, args, context)
    const body = JSON.stringify(request)
    const headers: Record<string, string> = { 'content-type': 'application/json', 'idempotency-key': request.idempotencyKey }
    if (options.tokenEnv !== undefined) headers.authorization = `Bearer ${secret(label, options.tokenEnv)}`
    if (options.signingKeyEnv !== undefined) headers['x-opencraw-signature'] = `sha256=${createHmac('sha256', secret(label, options.signingKeyEnv)).update(body).digest('hex')}`

    let response: Response
    try {
      response = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      // The abort reason is a DOMException, which is not an `Error` in every realm: read its name, not its prototype.
      const timedOut = (error as { name?: unknown }).name === 'TimeoutError'
      throw new CalloutError(label, timedOut ? `no answer within ${String(timeoutMs)} ms` : (error as Error).message)
    }
    const text = await response.text()
    if (!response.ok) throw new CalloutError(label, `HTTP ${String(response.status)}: ${text.trim().slice(0, 200)}`)

    return outputOfAnswer(label, parseAnswer(label, text))
  }
}

function secret (label: string, variable: string): string {
  const value = process.env[variable]
  if (value === undefined || value === '') throw new CalloutError(label, `the environment variable ${variable} is not set`)

  return value
}
