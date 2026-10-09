import type { CalloutResponse } from './callout.contract'
import { CalloutError } from './callout.error'
import { outputOfAnswer } from './callout-response.algorithm'

/** How long a callout may stay `pending` before it fails. */
export interface CalloutPollingOptions {
  /** Milliseconds a handler may keep answering `pending` before the call fails. Default 120000. */
  maxWaitMs?: number
}

const DEFAULT_MAX_WAIT_MS = 120_000
const DEFAULT_RETRY_AFTER_MS = 1000

/**
 * Asks a handler until it settles. `ok` and `error` answers end the call; a `pending` one waits
 * `retryAfterMs` (a second when it does not say) and asks again with the same request, so the same
 * idempotency key lets the service answer with the result it is working on. The call fails when the
 * handler is still pending after `maxWaitMs`.
 *
 * @param label - What is being called, for the error message.
 * @param attempt - One round trip: sends the request and returns the validated answer.
 * @param options - How long a pending answer may last.
 * @returns The `output` of the `ok` answer.
 * @throws CalloutError For an `error` answer, an attempt that fails, or a call still pending at the deadline.
 */
export async function settleCallout (label: string, attempt: () => Promise<CalloutResponse>, options: CalloutPollingOptions = {}): Promise<unknown> {
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
  const deadline = Date.now() + maxWaitMs
  for (;;) {
    const answer = await attempt()
    if (answer.status !== 'pending') return outputOfAnswer(label, answer)
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new CalloutError(label, `still pending after ${String(maxWaitMs)} ms`)
    const wait = Math.min(answer.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS, remaining)
    await new Promise(resolve => setTimeout(resolve, wait))
  }
}
