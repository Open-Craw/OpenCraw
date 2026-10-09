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
})
export type CalloutRequest = z.infer<typeof calloutRequestSchema>

/**
 * What a handler answers with. `ok` carries the result in `output`; `error` says why in `error`;
 * `pending` is reserved for a handler that will post its result later (the callback handler, a later
 * slice of issue #201) and is refused until that exists.
 */
export const calloutResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ok'), output: z.unknown().optional() }),
  z.strictObject({ status: z.literal('error'), error: z.string() }),
  z.strictObject({ status: z.literal('pending'), retryAfterMs: z.number().int().nonnegative().optional() }),
])
export type CalloutResponse = z.infer<typeof calloutResponseSchema>
