import { z } from 'zod'

/** What a callout asks for: a recipe's hook today; captcha solvers and access plugins use the same shapes in later slices (issue #201). */
export const calloutKindSchema = z.enum(['hook', 'captcha', 'access'])
export type CalloutKind = z.infer<typeof calloutKindSchema>

/**
 * The request a handler outside the process receives: one JSON document on stdin (a command) or in the
 * body of a POST (an endpoint). `input` is the value a hook transform is working on, absent for a
 * `hook` step; `args` are the recipe's own arguments.
 */
const valuesSchema = z.record(z.string(), z.unknown())

/** Where a handler that answered `pending` posts its `CalloutResolution`: sent only when the host can receive it, and valid for this one call. */
export const calloutCallbackSchema = z.strictObject({ url: z.string().url() })
export type CalloutCallback = z.infer<typeof calloutCallbackSchema>

export const calloutRequestSchema = z.strictObject({
  kind:    calloutKindSchema,
  name:    z.string().min(1),
  input:   z.unknown().optional(),
  args:    valuesSchema,
  context: z.strictObject({
    recipeId: z.string(),
    /** The extracted values visible at the call site. */
    scope:    valuesSchema,
  }),
  /** The same for the same call, so a service can answer a replay (a retry, or a durable function re-running) with the result it already has. */
  idempotencyKey: z.string(),
  /** Present when the host waits for results pushed back instead of asking again: post the `CalloutResolution` here. */
  callback:       calloutCallbackSchema.optional(),
})
export type CalloutRequest = z.infer<typeof calloutRequestSchema>

/**
 * What a handler answers with. `ok` carries the result in `output`; `error` says why in `error`;
 * `pending` says the work is not done: the caller asks again, after `retryAfterMs`, with the same
 * request (and so the same idempotency key) until the handler settles or the wait runs out.
 */
const okAnswerSchema = z.strictObject({ status: z.literal('ok'), output: z.unknown().optional() })
const errorAnswerSchema = z.strictObject({ status: z.literal('error'), error: z.string() })

export const calloutResponseSchema = z.discriminatedUnion('status', [
  okAnswerSchema,
  errorAnswerSchema,
  z.strictObject({ status: z.literal('pending'), retryAfterMs: z.number().int().nonnegative().optional() }),
])
export type CalloutResponse = z.infer<typeof calloutResponseSchema>
/**
 * What a handler posts to `callback.url` after it answered `pending`: the same `ok` or `error` it would
 * have answered with, and never `pending` again.
 */
export const calloutResolutionSchema = z.discriminatedUnion('status', [okAnswerSchema, errorAnswerSchema])
export type CalloutResolution = z.infer<typeof calloutResolutionSchema>

/** The answer of a handler that is still working. */
export type CalloutPending = Extract<CalloutResponse, { status: 'pending' }>
