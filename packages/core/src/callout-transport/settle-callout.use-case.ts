import { CalloutError } from '../callout-protocol'
import { CalloutParkedError } from './callout-parked.error'
import { currentCalloutWaiter } from './callout-waiter.store'
import { outputOfAnswer } from '../callout-protocol'
import type { CalloutResponse } from '../callout-protocol'

/** How long a callout may stay `pending` before it fails. */
export interface CalloutPollingOptions {
  /** Milliseconds a handler may keep answering `pending` before the call fails. Default 120000. */
  maxWaitMs?: number
}

/** What a caller of `settleCallout` decides for one call, beyond what its user configured. */
export interface SettleOptions extends CalloutPollingOptions {
  /**
   * `false` for a call that cannot be re-run later (a captcha on a live page, an access lease): it is polled
   * even when the run has a waiter, and never parked. Default true.
   */
  parkable?: boolean
  /** Stops the wait between polls. */
  signal?:   AbortSignal
}

const DEFAULT_MAX_WAIT_MS = 120_000
const DEFAULT_RETRY_AFTER_MS = 1000

/**
 * Settles a call to a handler outside the process.
 *
 * - A result that already arrived (the run's waiter holds one under the call's idempotency key) is
 *   returned without calling the handler.
 * - `ok` and `error` answers end the call.
 * - A `pending` answer, with a waiter, parks the call: it is recorded on the waiter and the call throws
 *   `CalloutParkedError`, because the host will run the recipe again when the result is posted back.
 * - A `pending` answer, without one, waits `retryAfterMs` (a second when it does not say) and asks again
 *   with the same request, so the same idempotency key lets the service answer with the result it is
 *   working on, until `maxWaitMs` passes.
 *
 * @param label - What is being called, for the error message.
 * @param idempotencyKey - The call's key, the same for the same call.
 * @param attempt - One round trip: sends the request and returns the validated answer.
 * @param options - How long a pending answer may last when it is polled, and whether the call may be parked.
 * @returns The `output` of the `ok` answer or of the posted-back result.
 * @throws CalloutError For an `error` answer, an attempt that fails, or a call still pending at the deadline.
 * @throws CalloutParkedError When the call parked.
 */
export async function settleCallout (label: string, idempotencyKey: string, attempt: () => Promise<CalloutResponse>, options: SettleOptions = {}): Promise<unknown> {
  const waiter = options.parkable === false ? undefined : currentCalloutWaiter()
  const arrived = waiter?.resolutions[idempotencyKey]
  if (arrived !== undefined) return outputOfAnswer(label, arrived)

  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
  const deadline = Date.now() + maxWaitMs
  for (;;) {
    if (options.signal?.aborted === true) throw new CalloutError(label, 'the call was aborted')
    const answer = await attempt()
    if (answer.status !== 'pending') return outputOfAnswer(label, answer)
    if (waiter !== undefined) {
      if (waiter.parked.every(call => call.idempotencyKey !== idempotencyKey)) {
        waiter.parked.push({ handler: label, idempotencyKey, ...(answer.retryAfterMs !== undefined && { retryAfterMs: answer.retryAfterMs }) })
      }
      throw new CalloutParkedError(label, idempotencyKey)
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new CalloutError(label, `still pending after ${String(maxWaitMs)} ms`)
    const wait = Math.min(answer.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS, remaining)
    await sleep(wait, options.signal)
  }
}

function sleep (ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}
