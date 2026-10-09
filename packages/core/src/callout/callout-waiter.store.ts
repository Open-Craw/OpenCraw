import { AsyncLocalStorage } from 'node:async_hooks'
import type { CalloutCallback, CalloutRequest, CalloutResolution } from './callout.contract'

/** A call whose handler answered `pending` and will post its result back instead of being asked again. */
export interface ParkedCallout {
  /** What was called, for messages (`POST https://svc/price`). */
  handler:        string
  idempotencyKey: string
  retryAfterMs?:  number
}

/**
 * How a run waits for slow callouts when the host can receive their results (the durable host). Without
 * one, a `pending` answer is polled; with one, the call is parked and the run is run again, from the
 * start, once the result has arrived.
 */
export interface CalloutWaiter {
  /** Results that have already arrived, by idempotency key: a call that finds its key here returns it without calling the handler. */
  resolutions: Readonly<Record<string, CalloutResolution>>
  /** Where a handler posts the result of the call with this key. */
  callbackFor: (idempotencyKey: string) => CalloutCallback
  /** Filled in as calls park, for the host to wait on after the run stops. */
  parked:      ParkedCallout[]
}

const storage = new AsyncLocalStorage<CalloutWaiter>()

/**
 * Runs `run` with a waiter, so every callout made inside it (a `commandHook` or `httpHook`, however deep
 * in the engine) parks instead of polling when its handler answers `pending`.
 *
 * @param waiter - The results so far, where to post new ones, and where parked calls are recorded.
 * @param run - The work, usually one crawl.
 * @returns Whatever `run` returns.
 */
export function withCalloutWaiter<T> (waiter: CalloutWaiter, run: () => Promise<T>): Promise<T> {
  return storage.run(waiter, run)
}

/** @returns The waiter of the run this call is part of, if the host set one. */
export function currentCalloutWaiter (): CalloutWaiter | undefined {
  return storage.getStore()
}

/**
 * Adds the callback of the current waiter to a request, so the handler knows where to post its result.
 *
 * @param request - The request about to be sent.
 * @returns The same request, with `callback` when there is a waiter.
 */
export function withCallback (request: CalloutRequest): CalloutRequest {
  const waiter = storage.getStore()

  return waiter === undefined ? request : { ...request, callback: waiter.callbackFor(request.idempotencyKey) }
}
