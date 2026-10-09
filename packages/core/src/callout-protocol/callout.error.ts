/** A callout failed: the process or endpoint could not be reached, timed out, answered badly, or said `error`. */
export class CalloutError extends Error {
  override readonly name = 'CalloutError'

  /**
   * @param handler - What was called (`command python3 slug.py`, `POST https://svc/slug`).
   * @param reason - Why it failed.
   */
  constructor (readonly handler: string, reason: string) {
    super(`${handler}: ${reason}`)
  }
}
