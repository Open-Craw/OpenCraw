import { CalloutError } from '../callout-protocol'

/**
 * A callout answered `pending` and the host will run the recipe again once the result has been posted
 * back. It stops the step that made the call; the host reads what is parked from its waiter, so it never
 * has to recognise this error after the engine has turned it into a failed step.
 */
export class CalloutParkedError extends CalloutError {
  /**
   * @param handler - What was called.
   * @param idempotencyKey - The call's key, which the result will come back under.
   */
  constructor (handler: string, readonly idempotencyKey: string) {
    super(handler, 'waiting for its result to be posted back')
  }
}
