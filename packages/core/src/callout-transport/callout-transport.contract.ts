import type { CalloutRequest, CalloutResponse } from '../callout-protocol'

/** Where a callout's own diagnostics go (what a program writes to stderr). */
export type CalloutLog = (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void

/**
 * One way of reaching a handler outside the process: send one request, get one validated answer. A
 * transport knows nothing of what is asked (a hook, a captcha, an access lease) or of waiting for a
 * `pending` answer; `settleCallout` does that on top of it.
 */
export interface CalloutTransport {
  /** What is called, for messages (`command python3 slug.py`, `POST https://svc/price`). */
  label: string
  call:  (request: CalloutRequest, log: CalloutLog) => Promise<CalloutResponse>
}
