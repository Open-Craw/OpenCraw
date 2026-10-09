import { calloutResponseSchema } from './callout.contract'
import type { CalloutResponse } from './callout.contract'
import { CalloutError } from './callout.error'

/**
 * A handler's answer, checked against the response schema.
 *
 * @param handler - What was called, for the error message.
 * @param raw - The parsed JSON the handler answered with.
 * @returns The answer: `ok`, `error` or `pending`.
 * @throws CalloutError For an answer that does not match the schema.
 */
export function answerOf (handler: string, raw: unknown): CalloutResponse {
  const parsed = calloutResponseSchema.safeParse(raw)
  if (!parsed.success) throw new CalloutError(handler, `the answer is not a callout response (${parsed.error.issues[0]?.message ?? 'invalid'}); expected {"status":"ok","output":…}`)

  return parsed.data
}

/**
 * The result a handler's final answer carries.
 *
 * @param handler - What was called, for the error message.
 * @param raw - The parsed JSON the handler answered with.
 * @returns The `output` of an `ok` answer.
 * @throws CalloutError For an answer that does not match the schema, an `error` answer, or a `pending` one (the caller waits for those).
 */
export function outputOfAnswer (handler: string, raw: unknown): unknown {
  const answer = answerOf(handler, raw)
  if (answer.status === 'error') throw new CalloutError(handler, answer.error)
  if (answer.status === 'pending') throw new CalloutError(handler, 'answered "pending", where a final answer is needed')

  return answer.output
}

/**
 * Parses a handler's answer text as JSON.
 *
 * @param handler - What was called, for the error message.
 * @param text - What the handler wrote or returned.
 * @returns The parsed value.
 * @throws CalloutError When the text is not JSON.
 */
export function parseAnswer (handler: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new CalloutError(handler, `the answer is not JSON: ${text.trim().slice(0, 200)}`)
  }
}
